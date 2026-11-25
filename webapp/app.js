import * as ck from "@cosmol-studio/cosmolkit";
import * as cv from "@cosmol-studio/cosmol-viewer";
import { parseFileText, parseCsvWithMapping, previewCsv } from "./parsers.js";
import { AnnotationLayer } from "./annotations.js";
import { addPngDpi } from "./png.js";
import { applyI18n, getLanguage, setLanguage, t } from "./i18n.js";

const dom = {
  file: document.getElementById("file"),
  openLabel: document.getElementById("openLabel"),
  style: document.getElementById("style"),
  resolution: document.getElementById("resolution"),
  surfaceOpacity: document.getElementById("surfaceOpacity"),
  nucleicOpacity: document.getElementById("nucleicOpacity"),
  outlineToggle: document.getElementById("outlineToggle"),
  ssaoToggle: document.getElementById("ssaoToggle"),
  autoLod: document.getElementById("autoLod"),
  effectStrength: document.getElementById("effectStrength"),
  atomIndices: document.getElementById("atomIndices"),
  background: document.getElementById("background"),
  keepView: document.getElementById("keepView"),
  busyCancel: document.getElementById("busyCancel"),
  reset: document.getElementById("reset"),
  shot: document.getElementById("shot"),
  copyImage: document.getElementById("copyImage"),
  exportPdf: document.getElementById("exportPdf"),
  exportWebm: document.getElementById("exportWebm"),
  exportGif: document.getElementById("exportGif"),
  fullscreen: document.getElementById("fullscreen"),
  theme: document.getElementById("theme"),
  help: document.getElementById("help"),
  helpModal: document.getElementById("helpModal"),
  helpClose: document.getElementById("helpClose"),
  cidInput: document.getElementById("cidInput"),
  cidApply: document.getElementById("cidApply"),
  sidebar: document.getElementById("sidebar"),
  splitter: document.getElementById("splitter"),
  batch: document.getElementById("batch"),
  overlay: document.getElementById("overlay"),
  animate: document.getElementById("animate"),
  lang: document.getElementById("lang"),
  saveProject: document.getElementById("saveProject"),
  projectFile: document.getElementById("projectFile"),
  restoreSession: document.getElementById("restoreSession"),
  recent: document.getElementById("recent"),
  list: document.getElementById("list"),
  search: document.getElementById("search"),
  count: document.getElementById("count"),
  empty: document.getElementById("empty"),
  info: document.getElementById("info"),
  infoName: document.getElementById("infoName"),
  infoBody: document.getElementById("infoBody"),
  stage: document.getElementById("stage"),
  canvas: document.getElementById("canvas"),
  annotations: document.getElementById("annotations"),
  annotationPanel: document.getElementById("annotationPanel"),
  annotationCount: document.getElementById("annotationCount"),
  labelList: document.getElementById("labelList"),
  measurementList: document.getElementById("measurementList"),
  clearAnnotations: document.getElementById("clearAnnotations"),
  exportAnnotations: document.getElementById("exportAnnotations"),
  toggleAnnotations: document.getElementById("toggleAnnotations"),
  undo: document.getElementById("undo"),
  redo: document.getElementById("redo"),
  csvModal: document.getElementById("csvModal"),
  csvFile: document.getElementById("csvFile"),
  csvDelimiter: document.getElementById("csvDelimiter"),
  csvHeader: document.getElementById("csvHeader"),
  csvPreview: document.getElementById("csvPreview"),
  csvSmilesFields: document.getElementById("csvSmilesFields"),
  csvCoordFields: document.getElementById("csvCoordFields"),
  csvSmilesCol: document.getElementById("csvSmilesCol"),
  csvNameCol: document.getElementById("csvNameCol"),
  csvElementCol: document.getElementById("csvElementCol"),
  csvXCol: document.getElementById("csvXCol"),
  csvYCol: document.getElementById("csvYCol"),
  csvZCol: document.getElementById("csvZCol"),
  csvValid: document.getElementById("csvValid"),
  csvApplyAll: document.getElementById("csvApplyAll"),
  csvCancel: document.getElementById("csvCancel"),
  csvImport: document.getElementById("csvImport"),
  view2d: document.getElementById("view2d"),
  rdkitSvg: document.getElementById("rdkitSvg"),
  export2d: document.getElementById("export2d"),
  addLabelBtn: document.getElementById("addLabelBtn"),
  labelPicker: document.getElementById("labelPicker"),
  labelSearch: document.getElementById("labelSearch"),
  labelCandidates: document.getElementById("labelCandidates"),
  drop: document.getElementById("drop"),
  busy: document.getElementById("busy"),
  busyText: document.getElementById("busyText"),
  toast: document.getElementById("toast"),
  kindBadge: document.getElementById("kindBadge"),
  hint: document.getElementById("hint"),
};

const state = {
  entries: [],
  activeId: null,
  nextId: 1,
  styleMode: "ball-stick",
  background: "dark",
  surfaceOpacity: 0.35,
  nucleicOpacity: 1,
  outlineEnabled: false,
  ssaoEnabled: false,
  effectScale: 1,
  autoLod: true,
  showAtomIndices: false,
  search: "",
  batchCancel: false,
  batchRunning: false,
  overlayMode: false,
  overlayEntries: [],
  overlayCopies: [],
  overlayStyles: [],
  animating: false,
  animation: null,
  animationEntries: [],
  scene: null,
  style: null,
  extraStyle: null,
  rendering: false,
};

let viewer = null;
let annotations = null;
let busyDepth = 0;
let renderChain = Promise.resolve();
let toastTimer = 0;
let csvState = null;
let csvResolve = null;
let viewMode = "3d";
let rdkitModule = null;
let rdkitLoading = null;



main().catch((error) => {
  console.error(error);
  toast(`初始化失败：${error?.message || error}`, true);
});

async function main() {
  if (!window.WebGL2RenderingContext && !window.WebGLRenderingContext) {
    throw new Error("浏览器不支持 WebGL");
  }
  viewer = cv.Viewer.new("canvas");
  annotations = new AnnotationLayer({
    viewer,
    stage: dom.stage,
    baseCanvas: dom.canvas,
    overlay: dom.annotations,
    onChange: renderAnnotationPanel,
    onSelect: (entry) => {
      entry.svg2d = null;
    },
  });
  bindEvents();
  syncLanguageUi();
  setupTheme();
  setupSplitter();
  try {
    if (localStorage.getItem("molviewer.annotationsCollapsed") === "1") {
      dom.annotationPanel.classList.add("collapsed");
      dom.toggleAnnotations.textContent = "+";
    }
  } catch { /* ignore */ }
  renderRecentProjects();
  setupAutosaveRestore();

  window.__molviewer = {
    loadText: addText,
    cameraState: () => Array.from(viewer.cameraState()),
    labels: () => (state.entries.find((item) => item.id === state.activeId)?.labels || []).map((item) => ({ ...item })),
    measurements: () => (state.entries.find((item) => item.id === state.activeId)?.measurements || []).map((item) => ({ ...item })),
    projectAtoms: () => annotations.projectAll(),
    labelBoxes: () => annotations.labelBoxes.map(({ label, box }) => ({ text: label.text, box: { ...box }, dx: label.dx || 0, dy: label.dy || 0 })),
    selected: () => activeEntry()?.selectedKey || null,
    shot: async () => Array.from(await viewer.takeScreenshot()),
    entries: () => state.entries.map(publicEntry),
    display: (id) => {
      const entry = state.entries.find((item) => item.id === id);
      return display(entry);
    },
    clear: clearAll,
  };
}

/* ------------------------------------------------------------------ */
/* files                                                                */
/* ------------------------------------------------------------------ */

function publicEntry(entry) {
  return {
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    format: entry.format,
    meta: { ...entry.meta },
  };
}

function registerParsed(parsed, group = null) {
  const taken = new Set(state.entries.map((entry) => entry.name));
  const added = parsed.map((item) => {
    let name = item.name;
    let suffix = 2;
    while (taken.has(name)) name = `${item.name} (${suffix++})`;
    taken.add(name);
    return {
      id: `s${state.nextId++}`,
      ...item,
      name,
      group,
    };
  });
  state.entries.push(...added);
  renderList();
  return added;
}

function ingest(fileName, text) {
  return registerParsed(parseFileText(fileName, text), fileName);
}

function baseName(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

function isCsvName(fileName) {
  return /\.(csv|tsv)$/i.test(fileName);
}

function isXlsxName(fileName) {
  return /\.xlsx$/i.test(fileName);
}

function columnIndex(reference) {
  const letters = String(reference).match(/[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

async function xlsxToCsv(buffer) {
  if (!window.JSZip) throw new Error("JSZip 未加载");
  const zip = await window.JSZip.loadAsync(buffer);
  const parser = new DOMParser();
  const shared = [];
  const sharedFile = zip.file("xl/sharedStrings.xml");
  if (sharedFile) {
    const document = parser.parseFromString(await sharedFile.async("text"), "application/xml");
    for (const item of document.querySelectorAll("si")) shared.push(item.textContent || "");
  }
  const sheetFiles = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/sheet(\d+)/)?.[1]) - Number(b.match(/sheet(\d+)/)?.[1]));
  if (!sheetFiles.length) throw new Error("XLSX 中没有工作表");
  const document = parser.parseFromString(await zip.file(sheetFiles[0]).async("text"), "application/xml");
  const rows = new Map();
  let maxColumn = 0;
  for (const cell of document.querySelectorAll("sheetData > row > c")) {
    const reference = cell.getAttribute("r") || "A1";
    const row = Number(reference.match(/\d+/)?.[0] || 1) - 1;
    const column = columnIndex(reference);
    maxColumn = Math.max(maxColumn, column);
    const type = cell.getAttribute("t");
    let value = "";
    if (type === "inlineStr") value = cell.querySelector("is")?.textContent || "";
    else {
      const raw = cell.querySelector("v")?.textContent ?? "";
      if (type === "s") value = shared[Number(raw)] ?? "";
      else value = raw;
    }
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row)[column] = value;
  }
  if (!rows.size) throw new Error("XLSX 工作表为空");
  const lines = [];
  for (const row of [...rows.keys()].sort((a, b) => a - b)) {
    const cells = rows.get(row);
    const line = [];
    for (let column = 0; column <= maxColumn; column++) {
      const value = String(cells[column] ?? "");
      line.push(/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
    }
    lines.push(line.join(","));
  }
  return lines.join("\n");
}

async function readTextFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decode = (encoding) => new TextDecoder(encoding).decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return decode("utf-16le");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return decode("utf-16be");
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gb18030").decode(bytes);
  }
}

let parseWorker = null;
let workerRequestId = 0;

function getParseWorker() {
  if (!parseWorker) {
    parseWorker = new Worker("./parse-worker.js", { type: "module" });
  }
  return parseWorker;
}

function analyzeFiles(files) {
  return new Promise((resolve, reject) => {
    const worker = getParseWorker();
    const id = ++workerRequestId;
    const timer = window.setTimeout(() => {
      worker.removeEventListener("message", onMessage);
      reject(new Error("后台解析超时"));
    }, 60000);
    const onMessage = (event) => {
      if (event.data?.id !== id) return;
      window.clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      if (event.data.ok) resolve(event.data.files);
      else reject(new Error(event.data.error || "后台解析失败"));
    };
    const onError = (event) => {
      window.clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      reject(new Error(event.message || "后台解析失败"));
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage({ id, files });
  });
}

async function analyzeFallback(files) {
  const result = [];
  for (const file of files) {
    let logicalName = file.name;
    let text;
    if (/\.gz$/i.test(file.name)) {
      if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot decompress .gz files");
      const stream = new Blob([await file.arrayBuffer()]).stream().pipeThrough(new DecompressionStream("gzip"));
      text = await new Response(stream).text();
      logicalName = file.name.replace(/\.gz$/i, "");
    } else {
      text = await readTextFile(file);
    }
    if (/\.(sdf|mol)$/i.test(logicalName)) {
      const records = text.split(/\$\$\$\$/).map((record) => record.trim()).filter(Boolean);
      result.push({ name: logicalName, records: records.length ? records : [text] });
    } else {
      result.push({ name: logicalName, text, csv: isCsvName(logicalName) });
    }
  }
  return result;
}

async function addFiles(fileList) {
  const allFiles = Array.from(fileList || []);
  if (!allFiles.length) return;
  const files = allFiles.filter((file) => {
    if (file.size > 120 * 1024 * 1024) {
      toast(`${file.name}：文件超过 120 MB，已跳过`, true);
      return false;
    }
    return true;
  });
  if (!files.length) return;
  const xlsxFiles = files.filter((file) => isXlsxName(file.name));
  const regularFiles = files.filter((file) => !isXlsxName(file.name));

  pushBusy(t("读取文件…"));
  const added = [];
  let sharedCsvMapping = null;
  try {
    let analyzed = [];
    if (regularFiles.length) {
      try {
        analyzed = await analyzeFiles(regularFiles);
      } catch {
        analyzed = await analyzeFallback(regularFiles);
      }
    }
    for (const file of xlsxFiles) {
      try {
        const text = await xlsxToCsv(await file.arrayBuffer());
        analyzed.unshift({ name: file.name.replace(/\.xlsx$/i, ".csv"), text });
      } catch (error) {
        toast(`${file.name}：${error?.message || error}`, true);
      }
    }

    for (const item of analyzed) {
      try {
        if (isCsvName(item.name)) {
          let mapping = sharedCsvMapping;
          if (!mapping) {
            mapping = await openCsvModal(item.name, item.text);
            if (!mapping) continue;
            if (mapping.applyAll) sharedCsvMapping = mapping;
          }
          added.push(...registerParsed(parseCsvWithMapping(item.text, baseName(item.name), mapping), item.name));
        } else if (item.entries) {
          const entries = item.entries.map((entry) => ({
            name: entry.name,
            kind: entry.kind,
            format: entry.format,
            meta: entry.meta,
            ck: entry.type === "protein"
              ? ck.Protein.fromTransferBinary(entry.data)
              : ck.Molecule.fromTransferBinary(entry.data),
            needsEmbed: false,
          }));
          added.push(...registerParsed(entries, item.name));
        } else if (item.records) {
          const total = item.records.length;
          for (let index = 0; index < total; index++) {
            const base = baseName(item.name);
            const fileName = total > 1 ? `${base} #${index + 1}.sdf` : item.name;
            added.push(...registerParsed(parseFileText(fileName, item.records[index]), item.name));
            if (index % 10 === 9 || index === total - 1) {
              dom.busyText.textContent = `${t("解析中…")} ${index + 1}/${total}`;
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          }
        } else {
          added.push(...registerParsed(parseFileText(item.name, item.text), item.name));
        }
      } catch (error) {
        toast(`${item.name}：${error?.message || error}`, true);
      }
    }
  } finally {
    popBusy();
  }

  if (added.length) await display(added[0]);
  else if (!state.entries.length) renderInfo(null);
}

function csvSignature(preview) {
  return preview.headers.map((value) => String(value).trim().toLowerCase()).join("|");
}

function loadCsvMapping(preview) {
  try {
    const raw = localStorage.getItem(`molviewer.csv.${csvSignature(preview)}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function openCsvModal(fileName, text) {
  csvState = { fileName, text, preview: null };
  dom.csvFile.textContent = fileName;
  dom.csvDelimiter.value = "auto";
  dom.csvHeader.checked = true;
  dom.csvApplyAll.checked = false;
  dom.csvModal.hidden = false;
  refreshCsvModal(true);
  return new Promise((resolve) => {
    csvResolve = resolve;
  });
}

function closeCsvModal(mapping) {
  dom.csvModal.hidden = true;
  const resolve = csvResolve;
  csvResolve = null;
  csvState = null;
  if (resolve) resolve(mapping);
}

function fillColumnSelect(select, headers, noneLabel = null) {
  const options = [];
  if (noneLabel) {
    const option = document.createElement("option");
    option.value = "-1";
    option.textContent = noneLabel;
    options.push(option);
  }
  headers.forEach((header, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}. ${header || "(空列名)"}`;
    options.push(option);
  });
  select.replaceChildren(...options);
}

function refreshCsvModal(autoDetect) {
  if (!csvState) return;
  const delimiter = dom.csvDelimiter.value === "auto" ? undefined : dom.csvDelimiter.value;
  const preview = previewCsv(csvState.text, { delimiter, header: dom.csvHeader.checked });
  csvState.preview = preview;

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const header of preview.headers) {
    const th = document.createElement("th");
    th.textContent = header;
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = document.createElement("tbody");
  for (const row of preview.preview) {
    const tr = document.createElement("tr");
    for (let index = 0; index < preview.headers.length; index++) {
      const td = document.createElement("td");
      td.textContent = row[index] ?? "";
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  dom.csvPreview.replaceChildren(table);

  fillColumnSelect(dom.csvSmilesCol, preview.headers);
  fillColumnSelect(dom.csvNameCol, preview.headers, "（无）");
  fillColumnSelect(dom.csvElementCol, preview.headers);
  fillColumnSelect(dom.csvXCol, preview.headers);
  fillColumnSelect(dom.csvYCol, preview.headers);
  fillColumnSelect(dom.csvZCol, preview.headers);

  if (autoDetect) {
    const normalized = preview.headers.map((value) => String(value).toLowerCase().replace(/["'\s_\-().]/g, ""));
    const find = (...names) => normalized.findIndex((value) => names.includes(value));
    const smiles = find("smiles", "canonicalsmiles", "isomericsmiles", "smilesstring");
    const name = find("name", "id", "title", "compound", "ligand");
    const element = find("element", "symbol", "atom", "el", "atomsymbol");
    const x = find("x", "coordx", "xcoordinate");
    const y = find("y", "coordy", "ycoordinate");
    const z = find("z", "coordz", "zcoordinate");

    const saved = loadCsvMapping(preview);
    if (saved && saved.header === preview.header && saved.delimiter === preview.delimiter) {
      applyCsvMapping(saved);
    } else {
      setCsvMode(smiles >= 0 ? "smiles" : element >= 0 && x >= 0 && y >= 0 && z >= 0 ? "coords" : "smiles");
      if (smiles >= 0) dom.csvSmilesCol.value = String(smiles);
      if (name >= 0) dom.csvNameCol.value = String(name);
      if (element >= 0) dom.csvElementCol.value = String(element);
      if (x >= 0) dom.csvXCol.value = String(x);
      if (y >= 0) dom.csvYCol.value = String(y);
      if (z >= 0) dom.csvZCol.value = String(z);
    }
  }

  updateCsvFields();
}

function applyCsvMapping(mapping) {
  setCsvMode(mapping.mode || "smiles");
  const set = (select, value) => {
    if (value !== undefined && value !== null) select.value = String(value);
  };
  set(dom.csvSmilesCol, mapping.smilesCol);
  set(dom.csvNameCol, mapping.nameCol ?? -1);
  set(dom.csvElementCol, mapping.elementCol);
  set(dom.csvXCol, mapping.xCol);
  set(dom.csvYCol, mapping.yCol);
  set(dom.csvZCol, mapping.zCol);
}

function setCsvMode(mode) {
  for (const radio of document.querySelectorAll('input[name="csvMode"]')) {
    radio.checked = radio.value === mode;
  }
}

function csvMode() {
  return document.querySelector('input[name="csvMode"]:checked')?.value || "smiles";
}

function updateCsvFields() {
  const smiles = csvMode() === "smiles";
  dom.csvSmilesFields.hidden = !smiles;
  dom.csvCoordFields.hidden = smiles;
  updateCsvValidity();
}

function updateCsvValidity() {
  if (!csvState?.preview) return;
  const rows = csvState.preview.rows;
  let valid = 0;
  if (csvMode() === "smiles") {
    const column = Number(dom.csvSmilesCol.value);
    if (column >= 0) valid = rows.filter((row) => String(row[column] ?? "").trim()).length;
  } else {
    const columns = [dom.csvElementCol, dom.csvXCol, dom.csvYCol, dom.csvZCol].map((select) => Number(select.value));
    if (columns.every((value) => value >= 0)) {
      valid = rows.filter((row) =>
        columns.every((column) => String(row[column] ?? "").trim() !== "") &&
        Number.isFinite(Number(row[columns[1]])) &&
        Number.isFinite(Number(row[columns[2]])) &&
        Number.isFinite(Number(row[columns[3]]))
      ).length;
    }
  }
  dom.csvValid.textContent = t("有效行：{valid} / {rows}", { valid, rows: rows.length });
  dom.csvValid.classList.toggle("error", valid === 0);
  dom.csvImport.disabled = valid === 0;
}

function confirmCsvModal() {
  if (!csvState?.preview) return;
  const rows = csvState.preview.rows;
  const mode = csvMode();
  const mapping = {
    delimiter: csvState.preview.delimiter,
    header: dom.csvHeader.checked,
    mode,
    smilesCol: Number(dom.csvSmilesCol.value),
    nameCol: Number(dom.csvNameCol.value),
    elementCol: Number(dom.csvElementCol.value),
    xCol: Number(dom.csvXCol.value),
    yCol: Number(dom.csvYCol.value),
    zCol: Number(dom.csvZCol.value),
    applyAll: dom.csvApplyAll.checked,
  };
  if (mode === "smiles" && mapping.smilesCol < 0) return;
  if (mode === "coords" && [mapping.elementCol, mapping.xCol, mapping.yCol, mapping.zCol].some((value) => value < 0)) return;
  try {
    localStorage.setItem(`molviewer.csv.${csvSignature(csvState.preview)}`, JSON.stringify(mapping));
  } catch {
    /* storage is optional */
  }
  closeCsvModal(mapping);
}

async function addText(fileName, text) {
  const added = ingest(fileName, text);
  if (added.length) await display(added[0]);
  return added.map(publicEntry);
}


/* ------------------------------------------------------------------ */
/* rendering                                                            */
/* ------------------------------------------------------------------ */

function display(entry) {
  renderChain = renderChain
    .then(() => doDisplay(entry))
    .catch((error) => {
      console.error(error);
      toast(`渲染失败：${error?.message || error}`, true);
    });
  return renderChain;
}

async function doDisplay(entry) {
  if (!entry) {
    await showEmpty();
    return;
  }

  if (state.overlayMode) {
    state.overlayMode = false;
    state.overlayEntries = [];
    clearOverlayResources();
    updateOverlayButton();
  }
  if (state.animating) {
    state.animating = false;
    state.animation?.free();
    state.animation = null;
    state.animationEntries = [];
    updateAnimateButton();
  }
  pushBusy("渲染中…");
  let scene = null;
  let style = null;
  let extraStyle = null;
  try {
    if (entry.needsEmbed) {
      entry.ck.embed3dConformer_();
      entry.needsEmbed = false;
      entry.meta.atoms = entry.ck.numAtoms;
    }

    const backboneMode = entry.kind === "molecule"
      && state.styleMode === "nucleic-backbone"
      && Array.isArray(entry.nucleic)
      && entry.nucleic.length > 0;
    const nucleicCartoonMode = entry.kind === "molecule"
      && state.styleMode === "nucleic-cartoon"
      && Array.isArray(entry.nucleic)
      && entry.nucleic.length > 0;
    const nucleicRibbonMode = entry.kind === "molecule"
      && (state.styleMode === "nucleic-ribbon" || state.styleMode === "nucleic-ribbon-base")
      && Array.isArray(entry.nucleic)
      && entry.nucleic.length > 0;
    const autoLod = state.autoLod
      && entry.kind === "protein"
      && Number(entry.meta?.atoms || 0) > 30000
      && !["stick", "sphere", "ca-trace"].includes(state.styleMode);
    const caTraceMode = entry.kind === "protein" && (state.styleMode === "ca-trace" || autoLod);
    const parent = entry.parentId ? state.entries.find((item) => item.id === entry.parentId) : null;
    const selectionOverlay = Boolean(parent && entry.kind === "protein" && parent.kind === "protein");
    if (selectionOverlay) ensureGeometry(parent);
    else if (!backboneMode && !nucleicCartoonMode && !nucleicRibbonMode && !caTraceMode) ensureGeometry(entry);
    updateStyleOptions(entry);
    let backboneRadius = 0;
    let cartoonRadius = 0;
    let ribbonRadius = 0;
    let caTraceRadius = 0;
    scene = cv.Scene.new();
    applySceneEffects(scene);
    applySceneBackground(scene);
    if (selectionOverlay) {
      style = makeStyle(parent);
      extraStyle = cv.Style.sphere().color(new Uint8Array([255, 120, 50]));
      scene.set("main", parent.ck, style);
      scene.set("highlight", entry.ck, extraStyle);
    } else if (backboneMode) {
      style = null;
      backboneRadius = buildBackboneScene(scene, entry);
    } else if (nucleicCartoonMode) {
      style = null;
      cartoonRadius = buildNucleicCartoonScene(scene, entry);
    } else if (nucleicRibbonMode) {
      style = null;
      const ribbon = buildNucleicRibbonMesh(entry, state.styleMode === "nucleic-ribbon-base");
      if (ribbon) {
        const mesh = cv.Mesh.new(ribbon.vertices, ribbon.indices, ribbon.normals, ribbon.colors);
        scene.set("nucleic-ribbon", mesh);
        mesh.free();
        for (const connector of ribbon.connectors || []) {
          const stick = cv.Stick.new(new Float32Array(connector.a), new Float32Array(connector.b), 0.16);
          const tinted = stick.color(new Uint8Array(connector.color));
          stick.free();
          scene.add(tinted);
          for (const end of [connector.a, connector.b]) {
            const cap = cv.Sphere.new(new Float32Array(end), 0.16);
            const tintedCap = cap.color(new Uint8Array(connector.color));
            cap.free();
            scene.add(tintedCap);
          }
        }
        ribbonRadius = ribbon.radius;
      } else {
        style = makeStyle(entry);
        scene.set("main", entry.ck, style);
      }
    } else if (caTraceMode) {
      style = null;
      caTraceRadius = buildCaTraceScene(scene, entry);
    } else if (entry.kind === "protein" && state.styleMode === "cartoon-surface") {
      const base = cv.Style.cartoon();
      style = base.rainbowResidues();
      base.free();
      extraStyle = cv.Style.surface().opacity(state.surfaceOpacity);
      scene.set("main", entry.ck, style);
      scene.set("surface", entry.ck, extraStyle);
    } else {
      style = makeStyle(entry);
      scene.set("main", entry.ck, style);
    }
    const cameraCenter = selectionOverlay ? parent.center : backboneMode || nucleicCartoonMode || nucleicRibbonMode || caTraceMode ? [0, 0, 0] : entry.center;
    const cameraRadius = selectionOverlay ? parent.radius : backboneMode ? backboneRadius : nucleicCartoonMode ? cartoonRadius : nucleicRibbonMode ? ribbonRadius : caTraceMode ? caTraceRadius : entry.radius;
    scene.recenter(new Float32Array(cameraCenter));
    scene.setScale(1);
    const fov = 15;
    const distance = (Math.max(cameraRadius, 1) / Math.tan((fov * Math.PI) / 360)) * 1.15;
    scene.setCameraView(0, 0, 0, distance, new Float32Array([0, 0, 0]), fov);

    await viewer.render(scene);

    state.scene?.free();
    state.style?.free();
    state.extraStyle?.free();
    state.scene = scene;
    state.style = style;
    state.extraStyle = extraStyle;
    state.activeId = entry.id;
    annotations.setEntry(backboneMode || nucleicCartoonMode || nucleicRibbonMode || caTraceMode ? null : entry);

    renderList();
    renderInfo(entry);
    renderAnnotationPanel();
    dom.kindBadge.hidden = false;
    dom.kindBadge.textContent = entry.selectionCid ? "SELECTION" : backboneMode || nucleicCartoonMode || nucleicRibbonMode ? "NUCLEIC" : caTraceMode ? (autoLod ? "CA TRACE · LOD" : "CA TRACE") : entry.kind === "protein" ? "PROTEIN" : "MOLECULE";
    if (viewMode === "2d") {
      if (entry.kind === "protein") {
        setViewMode("3d");
        toast("2D 视图仅支持小分子/配体，已切回 3D", true);
      } else {
        render2d(entry);
      }
    }
  } catch (error) {
    scene?.free();
    style?.free();
    extraStyle?.free();
    if (entry.needsEmbed) entry.needsEmbed = true;
    throw error;
  } finally {
    popBusy();
  }
}

async function showEmpty() {
  state.activeId = null;
  state.style?.free();
  state.extraStyle?.free();
  state.style = null;
  state.extraStyle = null;
  state.scene?.free();
  state.scene = null;

  try {
    const scene = cv.Scene.new();
    applySceneBackground(scene);
    await viewer.render(scene);
    state.scene = scene;
  } catch {
    /* an empty scene may be rejected on some builds; the canvas keeps the old frame */
  }

  dom.kindBadge.hidden = true;
  updateOverlayButton();
  dom.view2d.hidden = true;
  dom.canvas.style.visibility = "";
  dom.annotations.style.visibility = "";
  dom.hint.style.visibility = "";
  annotations.setEntry(null);
  renderList();
  renderInfo(null);
  renderAnnotationPanel();
}

function applySceneBackground(scene) {
  if (state.background === "white") {
    scene.setBackgroundColor(new Uint8Array([255, 255, 255]));
    scene.setTransparentBackground(false);
  } else if (state.background === "transparent") {
    scene.setBackgroundColor(new Uint8Array([8, 13, 24]));
    scene.setTransparentBackground(true);
  } else {
    scene.setBackgroundColor(new Uint8Array([8, 13, 24]));
    scene.setTransparentBackground(false);
  }
}

function buildBackboneScene(scene, entry) {
  const points = entry.nucleic.flatMap((chain) => chain.points);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let i = 0; i < 3; i++) {
      if (point[i] < min[i]) min[i] = point[i];
      if (point[i] > max[i]) max[i] = point[i];
    }
  }
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  let radius = 1;
  const palette = [
    [80, 170, 255], [255, 160, 80], [110, 220, 150],
    [255, 110, 180], [120, 220, 255], [255, 210, 90],
  ];
  entry.nucleic.forEach((chain, chainIndex) => {
    const color = palette[chainIndex % palette.length];
    let previous = null;
    for (const point of chain.points) {
      const local = [point[0] - center[0], point[1] - center[1], point[2] - center[2]];
      radius = Math.max(radius, Math.hypot(local[0], local[1], local[2]));
      const sphere = cv.Sphere.new(new Float32Array(local), 0.55);
      const tintedSphere = sphere.color(new Uint8Array(color));
      sphere.free();
      scene.add(tintedSphere);
      if (previous) {
        const stick = cv.Stick.new(new Float32Array(previous), new Float32Array(local), 0.3);
        const tintedStick = stick.color(new Uint8Array(color));
        stick.free();
        scene.add(tintedStick);
      }
      previous = local;
    }
  });
  entry.backboneRadius = radius;
  return radius;
}

function ribbonNormalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function ribbonCross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function ribbonSub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function buildNucleicRibbonMesh(entry, includeBases) {
  const all = [];
  for (const chain of entry.nucleic) {
    for (const residue of chain.residues || []) {
      if (residue.p) all.push(residue.p);
      if (residue.c1) all.push(residue.c1);
      for (const atom of residue.base || []) all.push(atom.point);
    }
  }
  if (!all.length) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of all) {
    for (let i = 0; i < 3; i++) {
      if (point[i] < min[i]) min[i] = point[i];
      if (point[i] > max[i]) max[i] = point[i];
    }
  }
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const local = (point) => [point[0] - center[0], point[1] - center[1], point[2] - center[2]];
  const vertices = [];
  const normals = [];
  const indices = [];
  const colors = [];
  const connectors = [];
  let radius = 1;

  const alpha = Math.round(255 * state.nucleicOpacity);
  const push = (point, normal, color, alphaValue = alpha) => {
    const index = vertices.length / 3;
    vertices.push(point[0], point[1], point[2]);
    const n = ribbonNormalize(normal);
    normals.push(n[0], n[1], n[2]);
    colors.push(color[0], color[1], color[2], alphaValue);
    radius = Math.max(radius, Math.hypot(point[0], point[1], point[2]));
    return index;
  };
  const tri = (a, b, c, normal, color) => {
    const ia = push(a, normal, color);
    const ib = push(b, normal, color);
    const ic = push(c, normal, color);
    indices.push(ia, ib, ic);
  };

  const framesFor = (source) => {
    const frames = [];
    let prevTangent = null;
    let normal = null;
    source.forEach((point, index) => {
      const prev = source[Math.max(0, index - 1)];
      const next = source[Math.min(source.length - 1, index + 1)];
      const tangent = ribbonNormalize(ribbonSub(next, prev));
      if (!normal) {
        const reference = Math.abs(tangent[2]) > 0.92 ? [0, 1, 0] : [0, 0, 1];
        normal = ribbonNormalize(ribbonCross(tangent, reference));
      } else {
        const axis = ribbonCross(prevTangent, tangent);
        const sin = Math.hypot(axis[0], axis[1], axis[2]);
        const cos = Math.max(-1, Math.min(1,
          prevTangent[0] * tangent[0] + prevTangent[1] * tangent[1] + prevTangent[2] * tangent[2]
        ));
        if (sin > 1e-5) {
          const unit = [axis[0] / sin, axis[1] / sin, axis[2] / sin];
          const angle = Math.atan2(sin, cos);
          const c = Math.cos(angle);
          const s = Math.sin(angle);
          const dot = unit[0] * normal[0] + unit[1] * normal[1] + unit[2] * normal[2];
          const cross = ribbonCross(unit, normal);
          normal = ribbonNormalize([
            normal[0] * c + cross[0] * s + unit[0] * dot * (1 - c),
            normal[1] * c + cross[1] * s + unit[1] * dot * (1 - c),
            normal[2] * c + cross[2] * s + unit[2] * dot * (1 - c),
          ]);
        }
      }
      const projection = tangent[0] * normal[0] + tangent[1] * normal[1] + tangent[2] * normal[2];
      normal = ribbonNormalize([
        normal[0] - tangent[0] * projection,
        normal[1] - tangent[1] * projection,
        normal[2] - tangent[2] * projection,
      ]);
      const side = ribbonNormalize(ribbonCross(tangent, normal));
      frames.push({ point, tangent, normal, side });
      prevTangent = tangent;
    });
    return frames;
  };

  const sampleSpline = (points, samples) => {
    if (points.length < 2) return points;
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      for (let step = 0; step < samples; step++) {
        out.push(catmullRom(p0, p1, p2, p3, step / samples));
      }
    }
    out.push(points[points.length - 1]);
    return out;
  };

  const chainPalette = [
    [80, 170, 255], [255, 160, 80], [110, 220, 150],
    [255, 110, 180], [120, 220, 255], [255, 210, 90],
  ];

  entry.nucleic.forEach((chain, chainIndex) => {
    const basePoints = (chain.points || []).map(local);
    if (basePoints.length < 2) return;
    const samples = sampleSpline(basePoints, 8);
    const frames = framesFor(samples);
    const color = chainPalette[chainIndex % chainPalette.length];
    const width = 1.25;
    const thickness = 0.2;
    const sides = 16;
    const ringInfoFor = (point) => {
      const sorted = [];
      for (const residue of chain.residues || []) {
        if (!residue.p) continue;
        const distance = Math.hypot(
          point[0] - residue.p[0],
          point[1] - residue.p[1],
          point[2] - residue.p[2]
        );
        sorted.push({ residue, distance });
      }
      sorted.sort((a, b) => a.distance - b.distance);
      if (!sorted.length) return { color, widthScale: 1 };
      const first = sorted[0];
      const second = sorted[1];
      const weightFirst = 1 / Math.max(0.25, first.distance ** 2);
      const weightSecond = second ? 1 / Math.max(0.25, second.distance ** 2) : 0;
      const total = weightFirst + weightSecond || 1;
      const mix = [0, 1, 2].map((axis) => {
        const baseA = baseColorForResidue(first.residue.name);
        const baseB = second ? baseColorForResidue(second.residue.name) : baseA;
        const base = (baseA[axis] * weightFirst + baseB[axis] * weightSecond) / total;
        return Math.round(color[axis] * 0.42 + base * 0.58);
      });
      const purine = (residue) => /[AG]$/i.test(residue?.name || "");
      const widthScale = 1 + 0.08 * ((purine(first.residue) ? 1 : 0) * weightFirst + (purine(second?.residue) ? 1 : 0) * weightSecond) / total;
      return { color: mix, widthScale };
    };
    const frameInfos = frames.map((frame) => ringInfoFor(frame.point));
    const rings = [];
    const makeRing = (frame, scale, ringColor = color, widthScale = 1) => {
      const ring = [];
      const localWidth = width * widthScale;
      const localThickness = thickness * (0.92 + 0.08 * widthScale);
      for (let k = 0; k < sides; k++) {
        const angle = (k / sides) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const point = [
          frame.point[0] + (frame.side[0] * cos * localWidth + frame.normal[0] * sin * localThickness) * scale,
          frame.point[1] + (frame.side[1] * cos * localWidth + frame.normal[1] * sin * localThickness) * scale,
          frame.point[2] + (frame.side[2] * cos * localWidth + frame.normal[2] * sin * localThickness) * scale,
        ];
        const normal = [
          frame.side[0] * cos / localWidth + frame.normal[0] * sin / localThickness,
          frame.side[1] * cos / localWidth + frame.normal[1] * sin / localThickness,
          frame.side[2] * cos / localWidth + frame.normal[2] * sin / localThickness,
        ];
        ring.push(push(point, normal, ringColor));
      }
      return ring;
    };

    const first = frames[0];
    const last = frames[frames.length - 1];
    const capLength = 0.4;
    for (const scale of [0.3, 0.6, 0.85]) {
      const offset = capLength * (1 - scale);
      rings.push(makeRing({
        ...first,
        point: [
          first.point[0] - first.tangent[0] * offset,
          first.point[1] - first.tangent[1] * offset,
          first.point[2] - first.tangent[2] * offset,
        ],
      }, scale, frameInfos[0].color, frameInfos[0].widthScale));
    }
    frames.forEach((frame, index) => rings.push(makeRing(frame, 1, frameInfos[index].color, frameInfos[index].widthScale)));
    for (const scale of [0.85, 0.6, 0.3]) {
      const offset = capLength * (1 - scale);
      rings.push(makeRing({
        ...last,
        point: [
          last.point[0] + last.tangent[0] * offset,
          last.point[1] + last.tangent[1] * offset,
          last.point[2] + last.tangent[2] * offset,
        ],
      }, scale, frameInfos[frameInfos.length - 1].color, frameInfos[frameInfos.length - 1].widthScale));
    }

    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i];
      const b = rings[i + 1];
      for (let k = 0; k < sides; k++) {
        const k2 = (k + 1) % sides;
        // Outward winding for an ellipse swept along +tangent.
        indices.push(a[k], b[k2], a[k2]);
        indices.push(a[k], b[k], b[k2]);
      }
    }

    const startTip = [
      first.point[0] - first.tangent[0] * capLength,
      first.point[1] - first.tangent[1] * capLength,
      first.point[2] - first.tangent[2] * capLength,
    ];
    const endTip = [
      last.point[0] + last.tangent[0] * capLength,
      last.point[1] + last.tangent[1] * capLength,
      last.point[2] + last.tangent[2] * capLength,
    ];
    const startCenter = push(startTip, [-first.tangent[0], -first.tangent[1], -first.tangent[2]], frameInfos[0].color);
    const endCenter = push(endTip, last.tangent, frameInfos[frameInfos.length - 1].color);
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides;
      indices.push(startCenter, rings[0][k2], rings[0][k]);
      indices.push(endCenter, rings[rings.length - 1][k], rings[rings.length - 1][k2]);
    }

    if (!includeBases) return;
    for (const residue of chain.residues || []) {
      const base = (residue.base || []).map((atom) => local(atom.point));
      if (base.length < 3) continue;
      const baseColor = baseColorForResidue(residue.name);
      const centroid = [0, 1, 2].map((axis) => base.reduce((sum, point) => sum + point[axis], 0) / base.length);
      const newell = [0, 0, 0];
      for (let i = 0; i < base.length; i++) {
        const a = base[i];
        const b = base[(i + 1) % base.length];
        newell[0] += (a[1] - b[1]) * (a[2] + b[2]);
        newell[1] += (a[2] - b[2]) * (a[0] + b[0]);
        newell[2] += (a[0] - b[0]) * (a[1] + b[1]);
      }
      const normal = ribbonNormalize(newell);
      const projected = base.map((point) => {
        const offset = (point[0] - centroid[0]) * normal[0] + (point[1] - centroid[1]) * normal[1] + (point[2] - centroid[2]) * normal[2];
        return [point[0] - normal[0] * offset, point[1] - normal[1] * offset, point[2] - normal[2] * offset];
      });
      const planeCentroid = [0, 1, 2].map((axis) => projected.reduce((sum, point) => sum + point[axis], 0) / projected.length);
      const half = 0.2;
      const levels = [
        { z: 0, inset: 0 },
        { z: 0.38, inset: 0.035 },
        { z: 0.72, inset: 0.085 },
        { z: 1, inset: 0.14 },
      ];
      const buildRing = (level, direction) => projected.map((point) => {
        const z = direction * half * level.z;
        return [
          planeCentroid[0] + (point[0] - planeCentroid[0]) * (1 - level.inset) + normal[0] * z,
          planeCentroid[1] + (point[1] - planeCentroid[1]) * (1 - level.inset) + normal[1] * z,
          planeCentroid[2] + (point[2] - planeCentroid[2]) * (1 - level.inset) + normal[2] * z,
        ];
      });
      const topRings = levels.map((level) => buildRing(level, 1));
      const bottomRings = levels.map((level) => buildRing(level, -1));
      const topCenter = [planeCentroid[0] + normal[0] * half, planeCentroid[1] + normal[1] * half, planeCentroid[2] + normal[2] * half];
      const bottomCenter = [planeCentroid[0] - normal[0] * half, planeCentroid[1] - normal[1] * half, planeCentroid[2] - normal[2] * half];
      const darker = baseColor.map((value) => Math.round(value * 0.66));
      const topCenterIndex = push(topCenter, normal, baseColor);
      const bottomCenterIndex = push(bottomCenter, [-normal[0], -normal[1], -normal[2]], baseColor);
      const topEdge = topRings[topRings.length - 1];
      const bottomEdge = bottomRings[bottomRings.length - 1];
      for (let i = 0; i < projected.length; i++) {
        const next = (i + 1) % projected.length;
        const topA = push(topEdge[i], normal, baseColor);
        const topB = push(topEdge[next], normal, baseColor);
        const bottomA = push(bottomEdge[i], [-normal[0], -normal[1], -normal[2]], baseColor);
        const bottomB = push(bottomEdge[next], [-normal[0], -normal[1], -normal[2]], baseColor);
        indices.push(topCenterIndex, topA, topB);
        indices.push(bottomCenterIndex, bottomB, bottomA);
      }

      for (let level = 0; level < levels.length - 1; level++) {
        const lowerTop = topRings[level];
        const upperTop = topRings[level + 1];
        const lowerBottom = bottomRings[level];
        const upperBottom = bottomRings[level + 1];
        for (let i = 0; i < projected.length; i++) {
          const next = (i + 1) % projected.length;
          const edge = ribbonSub(projected[next], projected[i]);
          const outward = ribbonNormalize(ribbonCross(edge, normal));
          const topNormal = ribbonNormalize([outward[0] + normal[0] * 0.75, outward[1] + normal[1] * 0.75, outward[2] + normal[2] * 0.75]);
          const bottomNormal = ribbonNormalize([outward[0] - normal[0] * 0.75, outward[1] - normal[1] * 0.75, outward[2] - normal[2] * 0.75]);
          const a = push(lowerTop[i], topNormal, darker);
          const b = push(lowerTop[next], topNormal, darker);
          const c = push(upperTop[next], topNormal, darker);
          const d = push(upperTop[i], topNormal, darker);
          indices.push(a, b, c, a, c, d);

          const e = push(lowerBottom[i], bottomNormal, darker);
          const f = push(lowerBottom[next], bottomNormal, darker);
          const g = push(upperBottom[next], bottomNormal, darker);
          const h = push(upperBottom[i], bottomNormal, darker);
          indices.push(e, h, g, e, g, f);
        }
      }
      if (residue.c1) {
        connectors.push({
          a: local(residue.c1),
          b: planeCentroid,
          color: baseColor,
        });
      }
    }
  });

  if (!indices.length) return null;
  return {
    vertices: new Float32Array(vertices),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    colors: new Uint8Array(colors),
    connectors,
    radius,
  };
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1, 2].map((axis) =>
    0.5 * (
      (2 * p1[axis]) +
      (-p0[axis] + p2[axis]) * t +
      (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 +
      (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3
    )
  );
}

function buildNucleicCartoonScene(scene, entry) {
  const all = [];
  for (const chain of entry.nucleic) {
    for (const residue of chain.residues || []) {
      if (residue.p) all.push(residue.p);
      if (residue.c1) all.push(residue.c1);
      for (const atom of residue.base || []) all.push(atom.point);
    }
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of all) {
    for (let i = 0; i < 3; i++) {
      if (point[i] < min[i]) min[i] = point[i];
      if (point[i] > max[i]) max[i] = point[i];
    }
  }
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const local = (point) => [point[0] - center[0], point[1] - center[1], point[2] - center[2]];
  let radius = 1;
  const chainPalette = [
    [80, 170, 255], [255, 160, 80], [110, 220, 150],
    [255, 110, 180], [120, 220, 255], [255, 210, 90],
  ];
  for (const point of all) {
    const p = local(point);
    radius = Math.max(radius, Math.hypot(p[0], p[1], p[2]));
  }

  const addSphere = (point, size, color) => {
    const sphere = cv.Sphere.new(new Float32Array(local(point)), size);
    const tinted = sphere.color(new Uint8Array(color));
    sphere.free();
    scene.add(tinted);
  };
  const addStick = (a, b, size, color) => {
    const stick = cv.Stick.new(new Float32Array(local(a)), new Float32Array(local(b)), size);
    const tinted = stick.color(new Uint8Array(color));
    stick.free();
    scene.add(tinted);
  };

  entry.nucleic.forEach((chain, chainIndex) => {
    const backboneColor = chainPalette[chainIndex % chainPalette.length];
    const points = chain.points;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const samples = 6;
      for (let step = 0; step < samples; step++) {
        addSphere(catmullRom(p0, p1, p2, p3, step / samples), 0.42, backboneColor);
      }
    }
    addSphere(points[points.length - 1], 0.45, backboneColor);

    for (const residue of chain.residues || []) {
      const baseColor = baseColorForResidue(residue.name);
      const anchor = residue.c1 || residue.p;
      if (residue.p && residue.c1) addStick(residue.p, residue.c1, 0.28, [190, 210, 230]);
      if (residue.c1) addSphere(residue.c1, 0.32, [200, 220, 240]);

      const base = residue.base || [];
      if (base.length) {
        const centroid = [0, 1, 2].map((axis) =>
          base.reduce((sum, atom) => sum + atom.point[axis], 0) / base.length
        );
        if (anchor) addStick(anchor, centroid, 0.22, baseColor);
        for (let i = 0; i < base.length; i++) {
          addSphere(base[i].point, 0.2, baseColor);
          if (i > 0) addStick(base[i - 1].point, base[i].point, 0.14, baseColor);
        }
        if (base.length > 2) addStick(base[base.length - 1].point, base[0].point, 0.14, baseColor);
      }
    }
  });

  entry.nucleicCartoonRadius = radius;
  return radius;
}

function baseColorForResidue(name) {
  const letter = (name || "").replace(/^[DR]/i, "").slice(-1).toUpperCase();
  if (letter === "A") return [90, 210, 120];
  if (letter === "T" || letter === "U") return [255, 130, 110];
  if (letter === "G") return [255, 205, 80];
  if (letter === "C") return [100, 170, 255];
  return [200, 200, 200];
}

function buildCaTraceScene(scene, entry) {
  const chains = new Map();
  for (const atom of entry.ck.atoms || []) {
    if (atom.name?.asStr?.().trim() !== "CA") continue;
    const chainId = atom.residue?.chain?.id ?? 0;
    const residueId = atom.residue?.id ?? 0;
    if (!chains.has(chainId)) chains.set(chainId, []);
    chains.get(chainId).push({ residueId, point: atom.position });
  }
  const points = [...chains.values()].flatMap((values) => values.map((value) => value.point));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let i = 0; i < 3; i++) {
      if (point[i] < min[i]) min[i] = point[i];
      if (point[i] > max[i]) max[i] = point[i];
    }
  }
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  let radius = 1;
  const palette = [
    [80, 170, 255], [255, 160, 80], [110, 220, 150],
    [255, 110, 180], [120, 220, 255], [255, 210, 90],
  ];
  [...chains.values()].forEach((values, chainIndex) => {
    const color = palette[chainIndex % palette.length];
    const ordered = [...values].sort((a, b) => a.residueId - b.residueId);
    let previous = null;
    for (const value of ordered) {
      const local = [
        value.point[0] - center[0],
        value.point[1] - center[1],
        value.point[2] - center[2],
      ];
      radius = Math.max(radius, Math.hypot(local[0], local[1], local[2]));
      if (local.some((v) => !Number.isFinite(v))) console.log("BAD LOCAL", local, value.point, center);
      const sphere = cv.Sphere.new(new Float32Array(local), 0.45);
      const tintedSphere = sphere.color(new Uint8Array(color));
      sphere.free();
      scene.add(tintedSphere);
      if (previous) {
        const stick = cv.Stick.new(new Float32Array(previous), new Float32Array(local), 0.28);
        const tintedStick = stick.color(new Uint8Array(color));
        stick.free();
        scene.add(tintedStick);
      }
      previous = local;
    }
  });
  entry.caTraceRadius = radius;
  return radius;
}

function ensureGeometry(entry) {
  if (entry.center) return;
  const points = entry.kind === "protein"
    ? (entry.ck.atoms || []).map((atom) => atom.position).filter(Boolean)
    : (entry.ck.coordinates3d?.(0) || []);
  if (!points.length) {
    entry.center = [0, 0, 0];
    entry.radius = 10;
    return;
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let i = 0; i < 3; i++) {
      if (point[i] < min[i]) min[i] = point[i];
      if (point[i] > max[i]) max[i] = point[i];
    }
  }
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  let radiusSq = 0;
  for (const point of points) {
    const dx = point[0] - center[0];
    const dy = point[1] - center[1];
    const dz = point[2] - center[2];
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq > radiusSq) radiusSq = distanceSq;
  }
  entry.center = center;
  entry.radius = Math.sqrt(radiusSq) || 1;
}

function makeStyle(entry) {
  const mode = state.styleMode;

  if (entry.kind === "protein") {
    if (mode === "stick") return cv.Style.stick();
    if (mode === "sphere") return cv.Style.sphere();
    if (mode === "surface") {
      const base = cv.Style.surface();
      const styled = base.opacity(state.surfaceOpacity);
      base.free();
      return styled;
    }
    if (mode === "cartoon") {
      const base = cv.Style.cartoon();
      const colored = base.color(new Uint8Array([92, 170, 235]));
      base.free();
      return colored;
    }
    const base = cv.Style.cartoon();
    const rainbow = base.rainbowResidues();
    base.free();
    return rainbow;
  }

  if (mode === "stick") return cv.Style.stick();
  if (mode === "sphere") return cv.Style.sphere();
  return cv.Style.ballAndStick();
}

/* ------------------------------------------------------------------ */
/* removal                                                              */
/* ------------------------------------------------------------------ */

async function removeEntry(id) {
  const index = state.entries.findIndex((entry) => entry.id === id);
  if (index < 0) return;

  const [entry] = state.entries.splice(index, 1);
  const wasActive = state.activeId === id;
  renderList();

  if (wasActive) {
    await showEmpty();
    entry.ck.free();
    const next = state.entries[Math.min(index, state.entries.length - 1)];
    if (next) await display(next);
  } else {
    entry.ck.free();
  }
}

async function clearAll() {
  if (!state.entries.length) return;
  await showEmpty();
  for (const entry of state.entries) entry.ck.free();
  state.entries = [];
  renderList();
  renderInfo(null);
  toast("已清空全部结构");
}

/* ------------------------------------------------------------------ */
/* UI                                                                   */
/* ------------------------------------------------------------------ */

function renderList() {
  dom.count.textContent = String(state.entries.length);
  dom.empty.hidden = state.entries.length > 0;
  dom.list.hidden = state.entries.length === 0;

  const query = state.search.trim().toLowerCase();
  const visible = query
    ? state.entries.filter((entry) =>
        `${entry.name} ${entry.format} ${entry.kind} ${entry.meta?.smiles || ""}`.toLowerCase().includes(query)
      )
    : state.entries;
  const shown = visible.slice(0, 500);
  const fragment = document.createDocumentFragment();
  for (const entry of shown) {
    const li = document.createElement("li");
    li.className = `item ${entry.kind === "protein" ? "protein" : ""} ${entry.id === state.activeId ? "active" : ""}`;
    li.dataset.id = entry.id;

    const eye = document.createElement("button");
    eye.className = "eye";
    eye.dataset.hide = entry.id;
    eye.textContent = entry.hidden ? "○" : "◉";
    eye.title = entry.hidden ? t("显示") : t("隐藏");
    li.classList.toggle("hidden-entry", Boolean(entry.hidden));

    const pick = document.createElement("input");
    pick.type = "checkbox";
    pick.className = "pick";
    pick.checked = Boolean(entry.overlaySelected);
    pick.dataset.pick = entry.id;
    pick.title = t("加入叠加");

    const icon = document.createElement("span");
    icon.className = "icon";
    icon.textContent = entry.kind === "protein" ? "◈" : "⬡";

    const text = document.createElement("div");
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = entry.name;
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = `${entry.format} · ${entry.meta.atoms ?? "?"} ${t("原子")}`;
    text.append(name, sub);

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.dataset.remove = entry.id;
    remove.title = "移除";
    remove.textContent = "×";

    li.append(eye, pick, icon, text, remove);
    fragment.append(li);
  }
  dom.list.replaceChildren(fragment);
  if (visible.length > shown.length) {
    const more = document.createElement("li");
    more.className = "list-more";
    more.textContent = t("仅显示前 {n} 条，共 {total} 条；请用搜索过滤", { n: shown.length, total: visible.length });
    dom.list.append(more);
  }
  updateOverlayButton();
  updateAnimateButton();
}

function renderInfo(entry) {
  dom.info.hidden = !entry;
  if (!entry) return;

  dom.infoName.textContent = entry.name;
  const rows = [];
  const push = (label, value) => {
    if (value === undefined || value === null || value === "") return;
    rows.push([label, String(value)]);
  };

  push(t("类型"), entry.kind === "protein" ? t("蛋白质 / 生物大分子") : t("小分子 / 结构"));
  push(t("格式"), entry.format);
  push(t("原子"), entry.meta.atoms);
  push(t("键"), entry.meta.bonds);
  push(t("分子量"), entry.meta.molecularWeight ? `${entry.meta.molecularWeight.toFixed(2)} Da` : undefined);
  push(t("链"), entry.meta.chains);
  push(t("残基"), entry.meta.residues);
  push(t("模型"), entry.meta.models);
  push("SMILES", entry.meta.smiles);

  dom.infoBody.replaceChildren(
    ...rows.map(([label, value]) => {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      return [dt, dd];
    }).flat()
  );

  if (entry.meta.note) {
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = `ⓘ ${t(entry.meta.note)}`;
    dom.infoBody.append(note);
  }
}

function updateStyleOptions(entry) {
  const modes = entry?.kind === "protein"
    ? [
        ["cartoon-rainbow", "卡通 · 彩虹"],
        ["cartoon", "卡通 · 单色"],
        ["stick", "棍状"],
        ["sphere", "球体"],
        ["surface", "表面"],
        ["cartoon-surface", "卡通 + 表面"],
        ["ca-trace", "CA 骨架（快速）"],
      ]
    : [
        ["ball-stick", "球棍"],
        ["stick", "棍状"],
        ["sphere", "球体"],
      ];

  if (entry?.nucleic?.length) {
    modes.push(["nucleic-backbone", "核酸骨架"]);
    modes.push(["nucleic-cartoon", "核酸卡通"]);
    modes.push(["nucleic-ribbon", "核酸 Ribbon"]);
    modes.push(["nucleic-ribbon-base", "Ribbon + 碱基平面"]);
  }

  if (!modes.some(([value]) => value === state.styleMode)) {
    state.styleMode = modes[0][0];
  }

  dom.style.replaceChildren(
    ...modes.map(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = t(label);
      return option;
    })
  );
  dom.style.value = state.styleMode;
}

function activeEntry() {
  return state.entries.find((item) => item.id === state.activeId) || null;
}

function renderAnnotationPanel() {
  const entry = activeEntry();
  dom.annotationPanel.hidden = !entry;
  if (!entry) return;
  renderLabelPicker();

  const labels = entry.labels || [];
  const measurements = entry.measurements || [];
  dom.annotationCount.textContent = String(labels.length + measurements.length);
  scheduleAutosave();
  dom.undo.disabled = !annotations.canUndo();
  dom.redo.disabled = !annotations.canRedo();

  dom.labelList.replaceChildren(
    ...labels.map((label) => annotationItem("L", label.text, label.kind === "residue" ? t("残基") : t("原子"), label.id, "label"))
  );
  dom.measurementList.replaceChildren(
    ...measurements.map((item) => {
      const type = item.type || "distance";
      const tag = type === "distance" ? "M" : type === "angle" ? "∠" : "φ";
      const atoms = item.atoms || [item.a, item.b].filter(Boolean);
      const value = item.value ?? item.distance ?? 0;
      const meta = item.text || (type === "distance" ? `${value.toFixed(2)} Å` : `${value.toFixed(1)}°`);
      return annotationItem(tag, atoms.map((atom) => atom.text).join(" · "), meta, item.id, "measurement");
    })
  );

  if (!labels.length && !measurements.length) {
    const hint = document.createElement("div");
    hint.className = "annotation-empty";
    hint.textContent = t("点击原子/残基添加标签；切到“测距”点两个原子。");
    dom.labelList.replaceChildren(hint);
  }
}

function renderLabelPicker() {
  if (dom.labelPicker.hidden) return;
  const entry = activeEntry();
  if (!entry) return;
  const source = entry.kind === "protein" ? entry.residuePickables : entry.atomPickables;
  const query = dom.labelSearch.value.trim().toLowerCase();
  const filtered = (source || []).filter((item) => !query || item.text.toLowerCase().includes(query));
  const shown = filtered.slice(0, 200);
  dom.labelCandidates.replaceChildren(
    ...shown.map((item) => {
      const button = document.createElement("button");
      button.className = "candidate";
      button.dataset.key = item.key;
      button.textContent = item.text;
      if (entry.kind === "protein") {
        const meta = document.createElement("span");
        meta.className = "meta";
        meta.textContent = item.residueKey || "";
        button.append(meta);
      }
      return button;
    })
  );
  if (!shown.length) {
    const empty = document.createElement("div");
    empty.className = "annotation-empty";
    empty.textContent = t("没有匹配的原子/残基");
    dom.labelCandidates.replaceChildren(empty);
  }
}

async function exportAnnotations() {
  const entry = activeEntry();
  if (!entry) {
    toast("请先打开一个结构", true);
    return;
  }
  const rows = [["category", "type", "atoms", "value", "unit", "x", "y", "z"]];
  for (const label of entry.labels || []) {
    rows.push([
      "label", label.key?.startsWith("r") ? "residue" : "atom", label.text,
      "", "", ...(label.position || []),
    ]);
  }
  for (const item of entry.measurements || []) {
    const type = item.type || "distance";
    const atoms = (item.atoms || [item.a, item.b].filter(Boolean)).map((atom) => atom.text).join(" — ");
    const value = item.value ?? item.distance ?? 0;
    rows.push([
      "measurement", type, atoms, Number(value).toFixed(4),
      type === "distance" ? "A" : "deg", "", "", "",
    ]);
  }
  if (rows.length === 1) {
    toast("当前结构没有标注", true);
    return;
  }
  const csv = rows.map((row) => row.map((cell) => quoteCsv(String(cell ?? ""))).join(",")).join("\n");
  const result = await saveBytes(
    new TextEncoder().encode(csv),
    `${safeFileName(entry.name)}_annotations.csv`,
    [{ name: "CSV 表格", extensions: ["csv"] }]
  );
  if (result?.ok) toast(`标注已导出${result.filePath ? "：" + result.filePath : ""}`);
  else if (!result?.canceled) toast(`导出失败：${result?.error || "未知错误"}`, true);
}

function annotationItem(tag, text, meta, id, kind) {
  const row = document.createElement("div");
  row.className = "annotation-item";
  const body = document.createElement("div");
  const badge = document.createElement("span");
  badge.className = "tag";
  badge.textContent = tag;
  const label = document.createElement("span");
  label.textContent = text;
  const metaEl = document.createElement("span");
  metaEl.className = "meta";
  metaEl.textContent = ` ${meta}`;
  body.append(badge, label, metaEl);
  const remove = document.createElement("button");
  remove.textContent = "×";
  remove.title = t("删除");
  remove.dataset.delete = id;
  remove.dataset.kind = kind;
  row.dataset.annotation = id;
  row.dataset.annotationKind = kind;
  row.append(body, remove);
  return row;
}

function loadRecentProjects() {
  try {
    const list = JSON.parse(localStorage.getItem("molviewer.recent") || "[]");
    return Array.isArray(list) ? list.filter((item) => item?.path && item?.name).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveRecentProjects(list) {
  try { localStorage.setItem("molviewer.recent", JSON.stringify(list.slice(0, 8))); } catch { /* ignore */ }
}

function renderRecentProjects() {
  const list = loadRecentProjects();
  dom.recent.hidden = !list.length;
  dom.recent.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t("最近项目");
  dom.recent.append(placeholder);
  for (const item of list) {
    const option = document.createElement("option");
    option.value = item.path;
    option.textContent = item.name;
    dom.recent.append(option);
  }
}

function rememberProject(filePath, name) {
  if (!filePath) return;
  const list = loadRecentProjects().filter((item) => item.path !== filePath);
  list.unshift({ path: filePath, name: name || filePath.split("/").pop(), time: Date.now() });
  saveRecentProjects(list);
  renderRecentProjects();
}

async function openRecentProject(filePath) {
  if (!filePath) return;
  const result = await window.desktop?.readFile?.(filePath);
  if (!result?.ok) {
    toast(`最近项目打开失败：${result?.error || "unknown"}`, true);
    return;
  }
  const text = new TextDecoder("utf-8").decode(result.bytes);
  const file = new File([text], filePath.split("/").pop() || "recent.mvproj", { type: "application/json" });
  await loadProjectFile(file);
  rememberProject(filePath, file.name);
}

function setupSplitter() {
  let width = 292;
  try { width = Number(localStorage.getItem("molviewer.sidebarWidth")) || 292; } catch { /* ignore */ }
  width = Math.min(520, Math.max(220, width));
  document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  dom.splitter.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dom.splitter.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      const next = Math.min(520, Math.max(220, moveEvent.clientX - dom.sidebar.getBoundingClientRect().left));
      document.documentElement.style.setProperty("--sidebar-width", `${next}px`);
      width = next;
    };
    const up = () => {
      dom.splitter.removeEventListener("pointermove", move);
      dom.splitter.removeEventListener("pointerup", up);
      try { localStorage.setItem("molviewer.sidebarWidth", String(width)); } catch { /* ignore */ }
    };
    dom.splitter.addEventListener("pointermove", move);
    dom.splitter.addEventListener("pointerup", up);
  });
}

function setupTheme() {
  let theme = "dark";
  try { theme = localStorage.getItem("molviewer.theme") || "dark"; } catch { /* ignore */ }
  applyTheme(theme);
  dom.theme.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
  dom.theme.textContent = theme === "light" ? "☾" : "☀";
  dom.theme.title = theme === "light" ? "切换深色 / Dark" : "切换浅色 / Light";
  try { localStorage.setItem("molviewer.theme", theme); } catch { /* ignore */ }
}

function syncLanguageUi() {
  applyI18n();
  dom.lang.textContent = getLanguage() === "en" ? "中文" : "EN";
  const entry = activeEntry();
  updateStyleOptions(entry);
  renderList();
  renderInfo(entry);
  renderAnnotationPanel();
  updateOverlayButton();
  updateAnimateButton();
  renderRecentProjects();
}

function bindEvents() {
  dom.file.addEventListener("change", () => {
    addFiles(dom.file.files).finally(() => { dom.file.value = ""; });
  });

  dom.list.addEventListener("change", (event) => {
    const pick = event.target.closest("[data-pick]");
    if (!pick) return;
    const entry = state.entries.find((item) => item.id === pick.dataset.pick);
    if (entry) entry.overlaySelected = pick.checked;
    const count = state.entries.filter((item) => item.overlaySelected && !item.hidden).length;
    if (entry) {
      if (pick.checked && count < 2) toast(t("已加入叠加，请再勾选至少 1 个结构"));
      else if (pick.checked) toast(t("已选 {n} 个结构，点击“叠加选中”", { n: count }));
      else toast(t("已移出叠加"));
    }
    updateOverlayButton();
  });

  dom.animate.addEventListener("click", () => {
    if (state.animating) stopSequence();
    else playSequence();
  });

  dom.overlay.addEventListener("click", () => {
    if (state.overlayMode) exitOverlay();
    else enterOverlay();
  });

  dom.effectStrength.addEventListener("change", () => {
    state.effectScale = Number(dom.effectStrength.value);
    const entry = activeEntry();
    if (entry) display(entry);
  });

  dom.outlineToggle.addEventListener("change", () => {
    state.outlineEnabled = dom.outlineToggle.checked;
    const entry = activeEntry();
    if (entry) display(entry);
  });

  dom.autoLod.addEventListener("change", () => {
    state.autoLod = dom.autoLod.checked;
    const entry = activeEntry();
    if (entry) display(entry);
  });

  dom.ssaoToggle.addEventListener("change", () => {
    state.ssaoEnabled = dom.ssaoToggle.checked;
    const entry = activeEntry();
    if (entry) display(entry);
  });

  dom.nucleicOpacity.addEventListener("change", () => {
    state.nucleicOpacity = Number(dom.nucleicOpacity.value);
    const entry = activeEntry();
    if (entry) display(entry);
  });

  dom.surfaceOpacity.addEventListener("change", () => {
    state.surfaceOpacity = Number(dom.surfaceOpacity.value);
    const entry = activeEntry();
    if (entry) display(entry);
  });

  dom.atomIndices.addEventListener("change", () => {
    state.showAtomIndices = dom.atomIndices.checked;
    const entry = activeEntry();
    if (entry) {
      entry.svg2d = null;
      if (viewMode === "2d") render2d(entry);
    }
  });

  dom.background.addEventListener("change", () => {
    state.background = dom.background.value;
    const entry = activeEntry();
    if (entry) display(entry);
    else showEmpty();
  });

  dom.style.addEventListener("change", () => {
    state.styleMode = dom.style.value;
    const entry = state.entries.find((item) => item.id === state.activeId);
    if (entry) display(entry);
  });

  dom.reset.addEventListener("click", () => {
    const entry = state.entries.find((item) => item.id === state.activeId);
    if (entry) display(entry);
  });

  dom.shot.addEventListener("click", saveScreenshot);
  dom.copyImage.addEventListener("click", copyScreenshot);
  dom.exportPdf.addEventListener("click", exportPdf);
  dom.exportWebm.addEventListener("click", exportAnimationWebm);
  dom.exportGif.addEventListener("click", exportAnimatedGif);
  dom.cidApply.addEventListener("click", applyCidSelection);
  const closeHelp = () => { dom.helpModal.hidden = true; };
  dom.help.addEventListener("click", () => { dom.helpModal.hidden = false; });
  dom.helpClose.addEventListener("click", closeHelp);
  dom.helpModal.addEventListener("click", (event) => { if (event.target === dom.helpModal) closeHelp(); });

  dom.fullscreen.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => toast("全屏失败", true));
  });
  dom.batch.addEventListener("click", exportAll);
  dom.search?.addEventListener("input", () => {
    state.search = dom.search.value;
    renderList();
  });
  dom.lang.addEventListener("click", () => {
    setLanguage(getLanguage() === "en" ? "zh" : "en");
    syncLanguageUi();
  });

  dom.saveProject.addEventListener("click", saveProject);
  document.addEventListener("keydown", (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;
    if (event.key.toLowerCase() === "o") {
      event.preventDefault();
      dom.file.click();
    } else if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveProject();
    } else if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) annotations.redo();
      else annotations.undo();
    } else if (event.key.toLowerCase() === "y") {
      event.preventDefault();
      annotations.redo();
    } else if (event.key.toLowerCase() === "c" && event.shiftKey) {
      event.preventDefault();
      copyScreenshot();
    } else if (event.key.toLowerCase() === "e") {
      event.preventDefault();
      saveScreenshot();
    }
  });

  dom.projectFile.addEventListener("change", () => {
    const file = dom.projectFile.files?.[0];
    const load = loadProjectFile(file);
    load.then(() => {
      if (window.desktop?.getPath && file) rememberProject(window.desktop.getPath(file), file.name);
    }).finally(() => {
      dom.projectFile.value = "";
    });
  });

  dom.recent.addEventListener("change", () => {
    const filePath = dom.recent.value;
    dom.recent.value = "";
    if (filePath) openRecentProject(filePath);
  });
  dom.busyCancel.addEventListener("click", () => {
    if (!state.batchRunning) return;
    state.batchCancel = true;
    dom.busyCancel.hidden = true;
    dom.busyText.textContent = "正在取消，等待当前结构完成…";
  });

  dom.labelCandidates.addEventListener("click", (event) => {
    const button = event.target.closest("[data-key]");
    if (!button) return;
    const entry = activeEntry();
    if (!entry) return;
    const source = entry.kind === "protein" ? entry.residuePickables : entry.atomPickables;
    const item = (source || []).find((candidate) => candidate.key === button.dataset.key);
    if (item) {
      annotations.addLabel(item);
      dom.labelPicker.hidden = true;
    }
  });

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-mode]").forEach((item) => item.classList.toggle("active", item === button));
      annotations.setMode(button.dataset.mode);
    });
  });

  dom.clearAnnotations.addEventListener("click", () => annotations.clear());
  dom.exportAnnotations.addEventListener("click", exportAnnotations);
  dom.labelList.addEventListener("dblclick", (event) => {
    const row = event.target.closest("[data-annotation-kind='label']");
    const entry = activeEntry();
    if (!row || !entry) return;
    const label = (entry.labels || []).find((item) => item.id === row.dataset.annotation);
    if (!label) return;
    const text = window.prompt(t("编辑标签文字"), label.text);
    if (text === null || !text.trim() || text === label.text) return;
    annotations.pushHistory();
    label.text = text.trim();
    annotations.onChange();
    annotations.draw();
  });

  dom.measurementList.addEventListener("click", (event) => {
    if (event.target.closest("[data-delete]")) return;
    const row = event.target.closest("[data-annotation-kind='measurement']");
    const entry = activeEntry();
    if (!row || !entry) return;
    const measurement = (entry.measurements || []).find((item) => item.id === row.dataset.annotation);
    const atoms = measurement?.atoms || [measurement?.a, measurement?.b].filter(Boolean);
    if (!atoms?.length) return;
    entry.selectedKey = atoms[0].key;
    entry.svg2d = null;
    annotations.draw();
    if (viewMode === "2d") render2d(entry);
  });

  dom.toggleAnnotations.addEventListener("click", () => {
    const collapsed = dom.annotationPanel.classList.toggle("collapsed");
    dom.toggleAnnotations.textContent = collapsed ? "+" : "−";
    try { localStorage.setItem("molviewer.annotationsCollapsed", collapsed ? "1" : "0"); } catch { /* ignore */ }
  });

  dom.undo.addEventListener("click", () => annotations.undo());
  dom.redo.addEventListener("click", () => annotations.redo());

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setViewMode(button.dataset.view));
  });
  dom.export2d.addEventListener("click", export2dSvg);

  dom.annotationPanel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete]");
    if (!button) return;
    if (button.dataset.kind === "label") annotations.deleteLabel(button.dataset.delete);
    else annotations.deleteMeasurement(button.dataset.delete);
  });

  dom.addLabelBtn.addEventListener("click", () => {
    dom.labelPicker.hidden = !dom.labelPicker.hidden;
    if (!dom.labelPicker.hidden) {
      dom.labelSearch.value = "";
      dom.labelSearch.focus();
      renderLabelPicker();
    }
  });
  dom.labelSearch.addEventListener("input", renderLabelPicker);

  dom.list.addEventListener("click", (event) => {
    if (event.target.closest("[data-pick]")) return;
    const hide = event.target.closest("[data-hide]");
    if (hide) {
      const entry = state.entries.find((item) => item.id === hide.dataset.hide);
      if (!entry) return;
      entry.hidden = !entry.hidden;
      if (entry.hidden && state.activeId === entry.id) {
        const next = state.entries.find((item) => !item.hidden);
        if (next) display(next);
        else showEmpty();
      }
      renderList();
      return;
    }
    const remove = event.target.closest("[data-remove]");
    if (remove) {
      event.stopPropagation();
      removeEntry(remove.dataset.remove);
      return;
    }
    const item = event.target.closest("[data-id]");
    if (item) {
      const entry = state.entries.find((candidate) => candidate.id === item.dataset.id);
      if (entry) display(entry);
    }
  });

  const stage = dom.stage;
  document.addEventListener("dragover", (event) => event.preventDefault());
  document.addEventListener("drop", (event) => event.preventDefault());

  stage.addEventListener("dragenter", (event) => {
    event.preventDefault();
    stage.classList.add("dragging");
  });
  stage.addEventListener("dragover", (event) => {
    event.preventDefault();
    stage.classList.add("dragging");
  });
  stage.addEventListener("dragleave", (event) => {
    if (!stage.contains(event.relatedTarget)) stage.classList.remove("dragging");
  });
  stage.addEventListener("drop", (event) => {
    event.preventDefault();
    stage.classList.remove("dragging");
    addFiles(event.dataTransfer?.files);
  });

  dom.csvDelimiter.addEventListener("change", () => refreshCsvModal(true));
  dom.csvHeader.addEventListener("change", () => refreshCsvModal(true));
  document.querySelectorAll('input[name="csvMode"]').forEach((radio) => {
    radio.addEventListener("change", updateCsvFields);
  });
  [dom.csvSmilesCol, dom.csvNameCol, dom.csvElementCol, dom.csvXCol, dom.csvYCol, dom.csvZCol].forEach((select) => {
    select.addEventListener("change", updateCsvValidity);
  });
  dom.csvCancel.addEventListener("click", () => closeCsvModal(null));
  dom.csvImport.addEventListener("click", confirmCsvModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!dom.csvModal.hidden) closeCsvModal(null);
      if (!dom.helpModal.hidden) dom.helpModal.hidden = true;
    }
    if (event.key === "F11") {
      event.preventDefault();
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(event.target?.tagName)) return;
    if (event.key === "1") setViewMode("3d");
    if (event.key === "2") setViewMode("2d");
  });

  window.addEventListener("beforeunload", () => {
    try { viewer?.close(); } catch { /* ignore */ }
  });
}

async function getRdkit() {
  if (rdkitModule) return rdkitModule;
  if (!rdkitLoading) {
    rdkitLoading = Promise.resolve(window.initRDKitModule?.()).then((module) => {
      if (!module) throw new Error("RDKit WASM 未加载");
      rdkitModule = module;
      return module;
    });
  }
  return rdkitLoading;
}

async function build2dSvg(entry) {
  const RDKit = await getRdkit();
  let source = entry.meta.smiles;
  if (!source) {
    try {
      source = entry.ck.toSdf();
    } catch {
      source = null;
    }
  }
  if (!source) throw new Error("没有可用的分子结构");
  const mol = RDKit.get_mol(source);
  if (!mol) throw new Error("RDKit 无法解析该结构");
  let svg = null;
  const key = entry.selectedKey || "";
  const index = key.startsWith("a") ? Number(key.slice(1)) : -1;
  try {
    const details = {
      width: 900,
      height: 650,
      atoms: Number.isInteger(index) && index >= 0 && index < entry.ck.numAtoms ? [index] : [],
      highlightColour: [1, 0.82, 0.32, 1],
      addAtomIndices: Boolean(state.showAtomIndices),
    };
    svg = mol.get_svg_with_highlights(JSON.stringify(details));
  } catch {
    svg = null;
  }
  if (!svg) svg = mol.get_svg(900, 650);
  mol.delete?.();
  return svg;
}

async function render2d(entry) {
  if (!entry || entry.kind === "protein") return;
  pushBusy("生成 2D 结构…");
  try {
    const svg = await build2dSvg(entry);
    entry.svg2d = svg;
    dom.rdkitSvg.innerHTML = svg;
    dom.rdkitSvg.querySelectorAll("svg [class*='atom-']").forEach((element) => {
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        const indexes = [...element.classList]
          .map((name) => /^atom-(\d+)$/.exec(name))
          .filter(Boolean)
          .map((match) => Number(match[1]));
        if (!indexes.length) return;
        const index = indexes[indexes.length - 1];
        entry.selectedKey = `a${index}`;
        entry.svg2d = null;
        render2d(entry);
      });
    });
    dom.view2d.hidden = false;
    dom.canvas.style.visibility = "hidden";
    dom.annotations.style.visibility = "hidden";
    dom.hint.style.visibility = "hidden";
  } catch (error) {
    toast(`2D 生成失败：${error?.message || error}`, true);
    setViewMode("3d");
  } finally {
    popBusy();
  }
}

function setViewMode(mode) {
  viewMode = mode;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === mode);
  });
  if (mode === "2d") {
    const entry = activeEntry();
    if (!entry) return;
    if (entry.kind === "protein") {
      viewMode = "3d";
      document.querySelectorAll("[data-view]").forEach((button) => {
        button.classList.toggle("active", button.dataset.view === "3d");
      });
      toast("2D 视图仅支持小分子/配体", true);
      return;
    }
    render2d(entry);
  } else {
    dom.view2d.hidden = true;
    dom.canvas.style.visibility = "";
    dom.annotations.style.visibility = "";
    dom.hint.style.visibility = "";
    const entry = activeEntry();
    if (entry) display(entry);
  }
}

async function export2dSvg() {
  const entry = activeEntry();
  if (!entry?.svg2d) {
    toast("请先切到 2D 并生成结构", true);
    return;
  }
  const bytes = new TextEncoder().encode(entry.svg2d);
  const result = await saveBytes(bytes, `${safeFileName(entry.name)}.svg`, [{ name: "SVG 矢量图", extensions: ["svg"] }]);
  if (result?.ok) toast(`已保存${result.filePath ? "：" + result.filePath : ""}`);
}

function safeFileName(name) {
  return String(name || "structure").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
}

async function saveBytes(bytes, fileName, filters) {
  if (window.desktop?.saveFile) {
    return window.desktop.saveFile(bytes, fileName, filters);
  }
  const blob = new Blob([bytes]);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { ok: true };
}

async function compositePng(bytes) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  annotations.renderTo(ctx, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("PNG 编码失败"))), "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function sequenceEntries() {
  const groups = new Map();
  for (const entry of state.entries) {
    if (!entry.group) continue;
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group).push(entry);
  }
  const active = activeEntry();
  if (active?.group && (groups.get(active.group)?.length || 0) >= 2) return groups.get(active.group);
  for (const entries of groups.values()) if (entries.length >= 2) return entries;
  return [];
}

function updateAnimateButton() {
  if (state.animating) {
    dom.animate.disabled = false;
    dom.animate.textContent = t("停止动画");
    return;
  }
  const entries = sequenceEntries();
  dom.animate.disabled = entries.length < 2;
  dom.animate.textContent = entries.length >= 2 ? `${t("序列动画")} (${entries.length})` : t("序列动画");
}

async function playSequence() {
  const entries = sequenceEntries().slice(0, 200);
  if (entries.length < 2) return;
  if (state.overlayMode) {
    state.overlayMode = false;
    state.overlayEntries = [];
    clearOverlayResources();
  }
  if (viewMode === "2d") {
    viewMode = "3d";
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === "3d");
    });
    dom.view2d.hidden = true;
    dom.canvas.style.visibility = "";
    dom.annotations.style.visibility = "";
    dom.hint.style.visibility = "";
  }

  pushBusy("构建动画帧…");
  try {
    let radius = 1;
    for (const entry of entries) {
      if (entry.needsEmbed) {
        entry.ck.embed3dConformer_();
        entry.needsEmbed = false;
      }
      ensureGeometry(entry);
      radius = Math.max(radius, entry.radius);
    }
    const fov = 15;
    const distance = (radius / Math.tan((fov * Math.PI) / 360)) * 1.15;
    const animation = cv.Animation.new(0.15, -1n, false);
    for (const entry of entries) {
      const scene = cv.Scene.new();
      applySceneEffects(scene);
      applySceneBackground(scene);
      const base = entry.kind === "protein" ? cv.Style.cartoon() : cv.Style.ballAndStick();
      const style = entry.kind === "protein" ? base.rainbowResidues() : base;
      if (entry.kind === "protein") base.free();
      scene.set("main", entry.ck, style);
      scene.recenter(new Float32Array(entry.center));
      scene.setScale(1);
      scene.setCameraView(0, 0, 0, distance, new Float32Array([0, 0, 0]), fov);
      animation.addFrame(scene);
      scene.free();
      style.free();
    }

    state.animation?.free();
    state.scene?.free();
    state.style?.free();
    state.extraStyle?.free();
    state.scene = null;
    state.style = null;
    state.extraStyle = null;
    state.activeId = null;
    state.animation = animation;
    state.animationEntries = entries;
    state.animating = true;
    state.overlayMode = false;
    annotations.setEntry(null);
    renderList();
    renderInfo(null);
    dom.kindBadge.hidden = false;
    dom.kindBadge.textContent = "ANIMATION";
    dom.animate.disabled = false;
    dom.animate.textContent = t("停止动画");
    await viewer.play(animation);
    toast(`播放 ${entries.length} 帧，点击“停止动画”退出`);
  } catch (error) {
    toast(`动画失败：${error?.message || error}`, true);
  } finally {
    popBusy();
  }
}

async function stopSequence() {
  if (!state.animating) return;
  const entries = [...state.animationEntries];
  const animation = state.animation;
  state.animating = false;
  state.animation = null;
  state.animationEntries = [];
  try {
    if (entries.length) await display(entries[0]);
    else await showEmpty();
  } finally {
    animation?.free?.();
    dom.animate.disabled = true;
    dom.animate.textContent = t("序列动画");
    updateAnimateButton();
  }
}

function applySceneEffects(scene) {
  scene.setOutlineEnabled(state.outlineEnabled);
  scene.setSsaoEnabled(state.ssaoEnabled);
  scene.setOutlineStrength(0.2 * state.effectScale);
  scene.setSsaoStrength(0.1 * state.effectScale);
}

function updateOverlayButton() {
  const count = state.entries.filter((entry) => entry.overlaySelected && !entry.hidden).length;
  dom.overlay.disabled = count < 2 && !state.overlayMode;
  dom.overlay.classList.toggle("ready", count >= 2 && !state.overlayMode);
  dom.overlay.textContent = state.overlayMode ? t("退出叠加") : `${t("叠加选中")} (${count})`;
}

function clearOverlayResources() {
  for (const copy of state.overlayCopies) copy.free?.();
  for (const style of state.overlayStyles) style.free?.();
  state.overlayCopies = [];
  state.overlayStyles = [];
}

async function enterOverlay() {
  const selected = state.entries.filter((entry) => entry.overlaySelected && !entry.hidden);
  if (selected.length < 2) return;
  pushBusy("叠加渲染…");
  try {
    clearOverlayResources();
    const scene = cv.Scene.new();
    applySceneEffects(scene);
    applySceneBackground(scene);
    const palette = [
      [80, 170, 255], [255, 160, 80], [110, 220, 150],
      [255, 110, 180], [120, 220, 255], [255, 210, 90],
    ];
    let radius = 1;
    selected.forEach((entry, index) => {
      if (entry.needsEmbed) {
        entry.ck.embed3dConformer_();
        entry.needsEmbed = false;
      }
      ensureGeometry(entry);
      const copy = entry.ck.copy();
      if (entry.kind === "protein") {
        copy.translate_([-entry.center[0], -entry.center[1], -entry.center[2]]);
      } else {
        const coordinates = copy.coordinates3d?.(0);
        if (coordinates) {
          copy.set3dCoordinates_(
            coordinates.map((point) => [
              point[0] - entry.center[0],
              point[1] - entry.center[1],
              point[2] - entry.center[2],
            ])
          );
        }
      }
      const base = entry.kind === "protein" ? cv.Style.cartoon() : cv.Style.ballAndStick();
      const tinted = base.color(new Uint8Array(palette[index % palette.length]));
      base.free();
      scene.set(`overlay-${entry.id}`, copy, tinted);
      state.overlayCopies.push(copy);
      state.overlayStyles.push(tinted);
      radius = Math.max(radius, entry.radius);
    });
    scene.recenter(new Float32Array([0, 0, 0]));
    scene.setScale(1);
    const fov = 15;
    const distance = (radius / Math.tan((fov * Math.PI) / 360)) * 1.2;
    scene.setCameraView(0, 0, 0, distance, new Float32Array([0, 0, 0]), fov);

    await viewer.render(scene);
    state.scene?.free();
    state.style?.free();
    state.extraStyle?.free();
    state.scene = scene;
    state.style = null;
    state.extraStyle = null;
    state.activeId = null;
    state.overlayMode = true;
    state.overlayEntries = selected;
    annotations.setEntry(null);
    dom.kindBadge.hidden = false;
    dom.kindBadge.textContent = "OVERLAY";
    renderList();
    renderInfo(null);
    renderAnnotationPanel();
    updateOverlayButton();
    toast(`已叠加 ${selected.length} 个结构（按颜色区分）`);
  } catch (error) {
    toast(`叠加失败：${error?.message || error}`, true);
  } finally {
    popBusy();
  }
}

async function exitOverlay() {
  const entries = [...state.overlayEntries];
  state.overlayMode = false;
  state.overlayEntries = [];
  clearOverlayResources();
  updateOverlayButton();
  if (entries.length) await display(entries[0]);
  else await showEmpty();
}

function targetExportSize() {
  const value = dom.resolution?.value || "auto";
  if (!value || value === "auto") return null;
  const [width, height] = value.split("x").map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}

function currentFrame() {
  const state = viewer?.cameraState?.();
  return state && state.length >= 9 ? state[8] : 0;
}

async function waitForPaint(frames = 2, timeout = 4000) {
  const start = currentFrame();
  if (!start) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return;
  }
  const deadline = performance.now() + timeout;
  while (currentFrame() < start + frames && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function enterExportSize(width, height, keepCamera = false) {
  const savedCamera = keepCamera ? Array.from(viewer.cameraState()) : null;
  const stage = dom.stage;
  const previous = {
    width: stage.style.width,
    height: stage.style.height,
    flex: stage.style.flex,
  };
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.flex = "none";
  const deadline = performance.now() + 5000;
  while (
    (dom.canvas.width < width * 0.95 || dom.canvas.height < height * 0.95) &&
    performance.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await waitForPaint(2, 4000);
  await new Promise((resolve) => setTimeout(resolve, 120));
  return async () => {
    stage.style.width = previous.width;
    stage.style.height = previous.height;
    stage.style.flex = previous.flex;
    await new Promise((resolve) => setTimeout(resolve, 180));
    if (viewMode === "3d" && activeEntry()) {
      await display(activeEntry());
      if (savedCamera && savedCamera.length >= 8 && state.scene) {
        state.scene.setCameraView(
          savedCamera[0],
          savedCamera[1],
          savedCamera[2],
          savedCamera[3],
          new Float32Array([savedCamera[4], savedCamera[5], savedCamera[6]]),
          savedCamera[7]
        );
        await viewer.render(state.scene);
      }
    }
  };
}

async function withExportSize(width, height, action, keepCamera = false) {
  const restore = await enterExportSize(width, height, keepCamera);
  try {
    return await action();
  } finally {
    await restore();
  }
}

async function svgToPng(svg, width = 1800, height = 1300) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const png = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("PNG 编码失败"))), "image/png");
    });
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

function openAutosaveDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("molviewer", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("state")) db.createObjectStore("state");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeAutosave(payload) {
  if (typeof indexedDB === "undefined" || !payload?.entries?.length) return;
  const db = await openAutosaveDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("state", "readwrite");
    transaction.objectStore("state").put(JSON.stringify(payload), "autosave");
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function readAutosave() {
  if (typeof indexedDB === "undefined") return null;
  const db = await openAutosaveDb();
  const value = await new Promise((resolve, reject) => {
    const transaction = db.transaction("state", "readonly");
    const request = transaction.objectStore("state").get("autosave");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

async function buildProjectPayload() {
  const payload = {
    version: 1,
    background: state.background,
    styleMode: state.styleMode,
    active: activeEntry()?.name || null,
    camera: Array.from(viewer.cameraState() || []),
    entries: [],
  };
  for (const entry of state.entries) {
    try {
      if (entry.kind === "protein") {
        const structure = entry.ck.asBioStructure();
        try {
          payload.entries.push({
            name: entry.name,
            kind: entry.kind,
            format: entry.format,
            meta: entry.meta,
            type: "pdb",
            data: structure.toPdb(),
            labels: entry.labels || [],
            measurements: entry.measurements || [],
            selectedKey: entry.selectedKey || null,
            group: entry.group || null,
            nucleic: entry.nucleic || null,
            hidden: Boolean(entry.hidden),
            selectionCid: entry.selectionCid || null,
          });
        } finally {
          structure.free?.();
        }
      } else {
        if (entry.needsEmbed) {
          entry.ck.embed3dConformer_();
          entry.needsEmbed = false;
        }
        payload.entries.push({
          name: entry.name,
          kind: entry.kind,
          format: entry.format,
          meta: entry.meta,
          type: "sdf",
          data: entry.ck.toSdf(),
          labels: entry.labels || [],
          measurements: entry.measurements || [],
          selectedKey: entry.selectedKey || null,
          group: entry.group || null,
          nucleic: entry.nucleic || null,
          hidden: Boolean(entry.hidden),
        });
      }
    } catch {
      /* skip entries that cannot be serialized */
    }
  }
  return payload;
}

let autosaveTimer = 0;
function scheduleAutosave() {
  if (typeof indexedDB === "undefined" || !state.entries.length) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(async () => {
    try {
      await writeAutosave(await buildProjectPayload());
    } catch {
      /* autosave is best-effort */
    }
  }, 2500);
}

async function setupAutosaveRestore() {
  try {
    const value = await readAutosave();
    if (!value) return;
    dom.restoreSession.hidden = false;
    dom.restoreSession.onclick = async () => {
      try {
        const file = new File([value], "autosave.mvproj", { type: "application/json" });
        await loadProjectFile(file);
        dom.restoreSession.hidden = true;
      } catch (error) {
        toast(`恢复失败：${error?.message || error}`, true);
      }
    };
  } catch {
    /* IndexedDB may be unavailable */
  }
}

async function applyCidSelection() {
  const entry = activeEntry();
  const cid = dom.cidInput.value.trim();
  if (!entry || entry.kind !== "protein") {
    toast("请先打开一个蛋白结构", true);
    return;
  }
  if (!cid) return;
  pushBusy("构建选择…");
  try {
    const selection = ck.BioSelection.fromCid(cid);
    const filtered = entry.ck.withSelection(selection);
    selection.free?.();
    if (!filtered.numAtoms) {
      filtered.free?.();
      throw new Error("选择为空");
    }
    const selected = {
      id: `s${state.nextId++}`,
      name: `${entry.name} [${cid}]`,
      selectionCid: cid,
      parentId: entry.id,
      kind: "protein",
      format: `PDB · ${cid}`,
      ck: filtered,
      meta: {
        atoms: filtered.numAtoms,
        chains: filtered.numChains,
        residues: filtered.numResidues,
        models: filtered.numModels,
        note: `CID ${cid}`,
      },
      labels: [],
      measurements: [],
      needsEmbed: false,
      group: entry.group,
    };
    state.entries.push(selected);
    renderList();
    await display(selected);
  } catch (error) {
    toast(`选择失败：${error?.message || error}`, true);
  } finally {
    popBusy();
  }
}

async function saveProject() {
  if (!state.entries.length) {
    toast("没有可保存的结构", true);
    return;
  }
  pushBusy("保存项目…");
  try {
    const payload = await buildProjectPayload();
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const result = await saveBytes(bytes, "molvision.mvproj", [{ name: "MolVision 项目", extensions: ["mvproj"] }]);
    if (result?.ok) {
      rememberProject(result.filePath, "molvision.mvproj");
      toast(`项目已保存${result.filePath ? "：" + result.filePath : ""}`);
    }
    else if (!result?.canceled) toast(`保存失败：${result?.error || "未知错误"}`, true);
  } finally {
    popBusy();
  }
}

async function loadProjectFile(file) {
  if (!file) return;
  pushBusy("打开项目…");
  try {
    const text = await readTextFile(file);
    const payload = JSON.parse(text);
    if (!payload || payload.version !== 1 || !Array.isArray(payload.entries)) throw new Error("项目格式不正确");
    await clearAll();
    state.background = payload.background || "dark";
    state.styleMode = payload.styleMode || "ball-stick";
    dom.background.value = state.background;
    const added = [];
    for (const saved of payload.entries) {
      try {
        let ckObject;
        let kind = saved.kind;
        if (saved.type === "pdb") {
          ckObject = ck.Protein.fromPdb(saved.data);
          kind = "protein";
        } else {
          ckObject = ck.Molecule.fromSdf(saved.data, { removeHs: false });
          kind = "molecule";
        }
        const entry = {
          id: `s${state.nextId++}`,
          name: saved.name || "structure",
          kind,
          format: saved.format || (saved.type === "pdb" ? "PDB" : "SDF"),
          ck: ckObject,
          meta: saved.meta || { atoms: ckObject.numAtoms },
          labels: saved.labels || [],
          measurements: saved.measurements || [],
          selectedKey: saved.selectedKey || null,
          group: saved.group || saved.name || null,
          nucleic: saved.nucleic || null,
          hidden: Boolean(saved.hidden),
          selectionCid: saved.selectionCid || null,
          needsEmbed: false,
        };
        state.entries.push(entry);
        added.push(entry);
      } catch (error) {
        toast(`${saved.name || "结构"} 加载失败：${error?.message || error}`, true);
      }
    }
    renderList();
    updateStyleOptions(added[0] || null);
    dom.style.value = state.styleMode;
    if (added.length) {
      const target = added.find((entry) => entry.name === payload.active) || added[0];
      await display(target);
      if (payload.camera && payload.camera.length >= 8 && state.scene) {
        state.scene.setCameraView(
          payload.camera[0],
          payload.camera[1],
          payload.camera[2],
          payload.camera[3],
          new Float32Array([payload.camera[4], payload.camera[5], payload.camera[6]]),
          payload.camera[7]
        );
        await viewer.render(state.scene);
      }
    }
    toast(`项目已加载：${added.length} 个结构`);
  } catch (error) {
    toast(`打开项目失败：${error?.message || error}`, true);
  } finally {
    popBusy();
  }
}

async function captureScreenshotPng() {
  const entry = activeEntry();
  if (viewMode === "2d" && entry) {
    const svg = entry.svg2d || (await build2dSvg(entry));
    const target = targetExportSize();
    return addPngDpi(await svgToPng(svg, target?.width || 1800, target?.height || 1300));
  }
  const capture = async () => {
    if (!state.overlayMode && !dom.keepView.checked) await display(entry);
    await waitForPaint(2, 5000);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const bytes = await viewer.takeScreenshot();
    return addPngDpi(await compositePng(bytes));
  };
  const target = targetExportSize();
  if (target) {
    let png = null;
    await withExportSize(target.width, target.height, async () => {
      png = await capture();
    }, dom.keepView.checked);
    return png;
  }
  return capture();
}

async function saveScreenshot() {
  if (!state.activeId && !state.overlayMode) {
    toast("请先打开一个结构", true);
    return;
  }
  pushBusy("导出图片…");
  try {
    const entry = activeEntry();
    const png = await captureScreenshotPng();
    const result = await saveBytes(png, `${safeFileName(state.overlayMode ? "overlay" : entry?.name)}.png`, [{ name: "PNG 图片", extensions: ["png"] }]);
    if (result?.ok) toast(`已保存${result.filePath ? "：" + result.filePath : ""}`);
    else if (!result?.canceled) toast(`保存失败：${result?.error || "未知错误"}`, true);
  } catch (error) {
    toast(`截图失败：${error?.message || error}`, true);
  } finally {
    popBusy();
  }
}

async function pngBytesToPdf(pngBytes) {
  const bitmap = await createImageBitmap(new Blob([pngBytes], { type: "image/png" }));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const rgb = new Uint8Array(canvas.width * canvas.height * 3);
  for (let source = 0, target = 0; source < pixels.length; source += 4, target += 3) {
    rgb[target] = pixels[source];
    rgb[target + 1] = pixels[source + 1];
    rgb[target + 2] = pixels[source + 2];
  }
  const compressed = new Uint8Array(
    await new Response(
      new Blob([rgb]).stream().pipeThrough(new CompressionStream("deflate"))
    ).arrayBuffer()
  );

  const pageWidth = canvas.width * 72 / 96;
  const pageHeight = canvas.height * 72 / 96;
  const content = `q\n${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
  const encoder = new TextEncoder();
  const chunks = [];
  let length = 0;
  const push = (value) => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  const offsets = [];
  const object = (number, write) => {
    offsets[number] = length;
    push(`${number} 0 obj\n`);
    write();
    push("\nendobj\n");
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () => push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  object(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  object(4, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`);
    push(compressed);
    push("\nendstream");
  });
  object(5, () => {
    const contentBytes = encoder.encode(content);
    push(`<< /Length ${contentBytes.length} >>\nstream\n`);
    push(contentBytes);
    push("endstream");
  });

  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n`);
  for (let i = 1; i <= 5; i++) {
    push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const pdf = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    pdf.set(chunk, cursor);
    cursor += chunk.length;
  }
  return pdf;
}

async function exportPdf() {
  if (!state.activeId && !state.overlayMode) {
    toast("请先打开一个结构", true);
    return;
  }
  pushBusy("导出 PDF…");
  try {
    const png = await captureScreenshotPng();
    const pdf = await pngBytesToPdf(png);
    const name = `${safeFileName(state.overlayMode ? "overlay" : activeEntry()?.name)}.pdf`;
    const result = await saveBytes(pdf, name, [{ name: "PDF", extensions: ["pdf"] }]);
    if (result?.ok) toast(`PDF 已保存${result.filePath ? "：" + result.filePath : ""}`);
    else if (!result?.canceled) toast(`保存失败：${result?.error || "未知错误"}`, true);
  } catch (error) {
    toast(`PDF 导出失败：${error?.message || error}`, true);
  } finally {
    popBusy();
  }
}

function gifU16(value) {
  return [value & 255, (value >> 8) & 255];
}

function gifLzw(indices) {
  const clearCode = 256;
  const endCode = 257;
  const bytes = [];
  let accumulator = 0;
  let bits = 0;
  let codeSize = 9;
  let nextCode = 258;
  let dictionary = new Map();
  const emit = (code, size) => {
    accumulator |= code << bits;
    bits += size;
    while (bits >= 8) {
      bytes.push(accumulator & 255);
      accumulator >>= 8;
      bits -= 8;
    }
  };
  emit(clearCode, codeSize);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i += 1) {
    const suffix = indices[i];
    const key = prefix * 256 + suffix;
    if (dictionary.has(key)) {
      prefix = dictionary.get(key);
      continue;
    }
    emit(prefix, codeSize);
    if (nextCode < 4096) {
      dictionary.set(key, nextCode);
      nextCode += 1;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
    } else {
      emit(clearCode, codeSize);
      dictionary = new Map();
      nextCode = 258;
      codeSize = 9;
    }
    prefix = suffix;
  }
  emit(prefix, codeSize);
  emit(endCode, codeSize);
  if (bits > 0) bytes.push(accumulator & 255);
  return bytes;
}

function encodeGif(frames, width, height, delay = 8) {
  const out = [];
  const push = (...values) => out.push(...values);
  const text = (value) => push(...new TextEncoder().encode(value));
  text("GIF89a");
  push(...gifU16(width), ...gifU16(height), 0xf7, 0, 0);
  for (let i = 0; i < 256; i += 1) {
    if (i < 216) {
      push(Math.floor(i / 36) * 51, Math.floor(i / 6) % 6 * 51, (i % 6) * 51);
    } else {
      push(0, 0, 0);
    }
  }
  push(0x21, 0xff, 0x0b);
  text("NETSCAPE2.0");
  push(0x03, 0x01, 0x00, 0x00, 0x00);
  for (const frame of frames) {
    push(0x21, 0xf9, 0x04, 0x00, ...gifU16(delay), 0x00, 0x00);
    push(0x2c, ...gifU16(0), ...gifU16(0), ...gifU16(width), ...gifU16(height), 0x00);
    push(0x08);
    const compressed = gifLzw(frame);
    for (let offset = 0; offset < compressed.length; offset += 255) {
      const chunk = compressed.slice(offset, offset + 255);
      push(chunk.length, ...chunk);
    }
    push(0x00);
  }
  push(0x3b);
  return new Uint8Array(out);
}

async function pngToRgba(png, width, height) {
  const bitmap = await createImageBitmap(new Blob([png], { type: "image/png" }));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return context.getImageData(0, 0, width, height).data;
}

async function exportAnimatedGif() {
  if (!state.scene || !state.activeId || state.overlayMode) {
    toast("请先显示一个 3D 结构", true);
    return;
  }
  pushBusy("录制 GIF…");
  try {
    const width = 640;
    const height = 480;
    const camera = Array.from(viewer.cameraState() || []);
    if (camera.length < 8) throw new Error("没有相机状态");
    const [azimuth, elevation, roll, distance, tx, ty, tz, fov] = camera;
    const target = new Float32Array([tx, ty, tz]);
    const frames = [];
    const restore = await enterExportSize(width, height, true);
    try {
      for (let i = 0; i < 12; i += 1) {
        state.scene.setCameraView(azimuth + i * 30, elevation, roll, distance, target, fov);
        await viewer.render(state.scene);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const png = await viewer.takeScreenshot();
        const rgba = await pngToRgba(png, width, height);
        const indices = new Uint8Array(width * height);
        for (let pixel = 0; pixel < width * height; pixel += 1) {
          const r = Math.round(rgba[pixel * 4] / 51);
          const g = Math.round(rgba[pixel * 4 + 1] / 51);
          const b = Math.round(rgba[pixel * 4 + 2] / 51);
          indices[pixel] = r * 36 + g * 6 + b;
        }
        frames.push(indices);
      }
    } finally {
      await restore();
    }
    const gif = encodeGif(frames, width, height, 10);
    const result = await saveBytes(gif, `${safeFileName(activeEntry()?.name)}_turntable.gif`, [{ name: "GIF", extensions: ["gif"] }]);
    if (result?.ok) toast(`GIF 已保存${result.filePath ? "：" + result.filePath : ""}`);
    else if (!result?.canceled) toast(`保存失败：${result?.error || "未知错误"}`, true);
  } catch (error) {
    toast(`GIF 导出失败：${error?.message || error}`, true);
  } finally {
    popBusy();
  }
}

async function exportAnimationWebm() {
  if (!state.scene || !state.activeId || state.overlayMode) {
    toast("请先显示一个 3D 结构", true);
    return;
  }
  if (typeof MediaRecorder === "undefined" || typeof dom.canvas.captureStream !== "function") {
    toast("当前环境不支持动画录制", true);
    return;
  }
  pushBusy("录制动画…");
  try {
    const camera = Array.from(viewer.cameraState() || []);
    if (camera.length < 8) throw new Error("没有相机状态");
    const [azimuth, elevation, roll, distance, tx, ty, tz, fov] = camera;
    const target = new Float32Array([tx, ty, tz]);
    const stream = dom.canvas.captureStream(30);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();
    for (let i = 0; i < 36; i += 1) {
      state.scene.setCameraView(
        azimuth + i * 10,
        elevation,
        roll,
        distance,
        target,
        fov
      );
      await viewer.render(state.scene);
      await new Promise((resolve) => setTimeout(resolve, 90));
    }
    recorder.stop();
    await stopped;
    state.scene.setCameraView(azimuth, elevation, roll, distance, target, fov);
    await viewer.render(state.scene);
    const blob = new Blob(chunks, { type: "video/webm" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!bytes.length) throw new Error("录制结果为空");
    const name = `${safeFileName(activeEntry()?.name)}_turntable.webm`;
    const result = await saveBytes(bytes, name, [{ name: "WebM 视频", extensions: ["webm"] }]);
    if (result?.ok) toast(`动画已保存${result.filePath ? "：" + result.filePath : ""}`);
    else if (!result?.canceled) toast(`保存失败：${result?.error || "未知错误"}`, true);
  } catch (error) {
    toast(`动画导出失败：${error?.message || error}`, true);
  } finally {
    popBusy();
  }
}

async function copyScreenshot() {
  if (!state.activeId && !state.overlayMode) {
    toast("请先打开一个结构", true);
    return;
  }
  pushBusy("复制图片…");
  try {
    const png = await captureScreenshotPng();
    if (window.desktop?.copyPng) {
      const result = await window.desktop.copyPng(png);
      if (!result?.ok) throw new Error(result?.error || "clipboard failed");
    } else {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([png], { type: "image/png" }) })]);
    }
    toast("图片已复制到剪贴板");
  } catch (error) {
    toast(`复制失败：${error?.message || error}`, true);
  } finally {
    popBusy();
  }
}

async function exportAll() {
  const exportEntries = state.entries.filter((entry) => !entry.hidden);
  if (!exportEntries.length) {
    toast("没有可导出的结构", true);
    return;
  }
  if (!window.JSZip) {
    toast("JSZip 未加载，无法批量导出", true);
    return;
  }
  if (viewMode !== "3d") {
    viewMode = "3d";
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === "3d");
    });
    dom.view2d.hidden = true;
    dom.canvas.style.visibility = "";
    dom.annotations.style.visibility = "";
    dom.hint.style.visibility = "";
  }

  const zip = new window.JSZip();
  const manifest = ["name,kind,format,atoms,png,svg,png2d"];
  let index = 0;

  state.batchRunning = true;
  state.batchCancel = false;
  dom.busyCancel.hidden = false;
  pushBusy("批量导出…");
  const target = targetExportSize();
  const restore = target ? await enterExportSize(target.width, target.height) : null;
  try {
    for (const entry of exportEntries) {
      if (state.batchCancel) break;
      index += 1;
      dom.busyText.textContent = `批量导出 ${index}/${exportEntries.length}：${entry.name}`;
      let pngName = "";
      let svgName = "";
      let png2dName = "";
      try {
        await display(entry);
        await waitForPaint(2, 5000);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const shot = await viewer.takeScreenshot();
        const png = await compositePng(shot);
        const base = `${String(index).padStart(2, "0")}_${safeFileName(entry.name)}`;
        pngName = `${base}.png`;
        zip.file(pngName, addPngDpi(png));
        if (entry.kind !== "protein") {
          try {
            const svg = await build2dSvg(entry);
            svgName = `${base}.svg`;
            zip.file(svgName, svg);
            png2dName = `${base}_2d.png`;
            zip.file(png2dName, addPngDpi(await svgToPng(svg, 1200, 900)));
          } catch {
            /* 2D is best-effort per structure */
          }
        }
      } catch (error) {
        manifest.push(`${quoteCsv(entry.name)},${entry.kind},${entry.format},${entry.meta.atoms ?? ""},ERROR,${quoteCsv(String(error?.message || error))},`);
        continue;
      }
      manifest.push(
        [entry.name, entry.kind, entry.format, entry.meta.atoms ?? "", pngName, svgName, png2dName].map(quoteCsv).join(",")
      );
    }
    zip.file("manifest.csv", manifest.join("\n"));
    const blob = await zip.generateAsync({ type: "blob" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const result = await saveBytes(bytes, "molvision_export.zip", [{ name: "ZIP 压缩包", extensions: ["zip"] }]);
    const done = index;
    if (result?.ok) toast(`${state.batchCancel ? `已取消，已导出 ${done} 项` : "批量导出完成"}${result.filePath ? "：" + result.filePath : ""}`);
    else if (!result?.canceled) toast(`保存失败：${result?.error || "未知错误"}`, true);
  } catch (error) {
    toast(`批量导出失败：${error?.message || error}`, true);
  } finally {
    state.batchRunning = false;
    dom.busyCancel.hidden = true;
    if (restore) await restore();
    popBusy();
  }
}

function quoteCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function pushBusy(text) {
  busyDepth += 1;
  dom.busy.hidden = false;
  dom.busyText.textContent = t(text);
}

function popBusy() {
  busyDepth = Math.max(0, busyDepth - 1);
  if (busyDepth === 0) dom.busy.hidden = true;
}

function toast(message, error = false) {
  dom.toast.textContent = t(String(message));
  dom.toast.hidden = false;
  dom.toast.classList.toggle("error", error);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { dom.toast.hidden = true; }, 4600);
}
