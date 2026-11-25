/**
 * Format adapters for MolVision.
 *
 * COSMolKit (CK) provides SDF / PDB / mmCIF / SMILES parsing. CSV is not a
 * standard molecular format, so this module implements two practical schemas:
 *
 *   1. compound table :  name,smiles
 *   2. atom table     :  element,x,y,z  (bonds inferred from covalent radii)
 *
 * Everything returns plain entry descriptors; the UI owns CK handle lifetimes.
 */
import * as ck from "@cosmol-studio/cosmolkit";

const MAX_SMILES_ROWS = 2000;
const MAX_COORD_ATOMS = 20000;
const MAX_BOND_ATOMS = 1500;

const RADII = {
  H: 0.31, B: 0.84, C: 0.76, N: 0.71, O: 0.66, F: 0.57,
  SI: 1.11, P: 1.07, S: 1.05, CL: 1.02, BR: 1.20, I: 1.39,
  NA: 1.66, K: 2.03, CA: 1.76, MG: 1.41, FE: 1.32, ZN: 1.22,
  CU: 1.32, MN: 1.39, SE: 1.20, CO: 1.26, NI: 1.24,
};

const MAX_BONDS = { H: 1, B: 4, C: 4, N: 4, O: 2, F: 1, SI: 4, P: 5, S: 6, CL: 1, BR: 1, I: 1 };

const ELEMENT_NAMES = {
  carbon: "C", hydrogen: "H", oxygen: "O", nitrogen: "N", sulfur: "S",
  phosphorus: "P", fluorine: "F", chlorine: "Cl", bromine: "Br", iodine: "I",
  boron: "B", silicon: "Si", sodium: "Na", potassium: "K", calcium: "Ca",
  magnesium: "Mg", iron: "Fe", zinc: "Zn", copper: "Cu", manganese: "Mn",
  selenium: "Se", cobalt: "Co", nickel: "Ni",
};

/* ------------------------------------------------------------------ */
/* public entry point                                                   */
/* ------------------------------------------------------------------ */

/**
 * @param {string} fileName
 * @param {string} text
 * @returns {Array<{name:string, kind:'molecule'|'protein', format:string,
 *                  ck:object, needsEmbed?:boolean, meta:object}>}
 */
export function parseFileText(fileName, text) {
  const clean = String(text ?? "").replace(/^\uFEFF/, "");
  if (!clean.trim()) throw new Error("文件为空");

  const ext = (fileName.split(".").pop() || "").toLowerCase();
  const base = fileName.replace(/\.[^.]+$/, "");

  if (ext === "sdf" || ext === "mol") return parseSdf(clean, base);
  if (ext === "pdb" || ext === "ent") return parsePdb(clean, base);
  if (ext === "cif" || ext === "mmcif") return parseCif(clean, base);
  if (ext === "mol2") return parseMol2(clean, base);
  if (ext === "xyz") return parseXyz(clean, base);
  if (ext === "csv" || ext === "tsv") return parseCsv(clean, base);

  // Unknown extension: sniff by content before assuming CSV.
  if (/^(HEADER|TITLE|ATOM|HETATM|MODEL|CRYST1)/m.test(clean)) return parsePdb(clean, base);
  if (/V2000|V3000|\$\$\$\$/.test(clean)) return parseSdf(clean, base);
  if (/^@<TRIPOS>MOLECULE/m.test(clean)) return parseMol2(clean, base);
  if (/^\s*\d+\s*\r?\n/.test(clean) && /^\s*[A-Za-z]{1,2}\s+[-\d.]/m.test(clean)) return parseXyz(clean, base);
  if (/^data_/m.test(clean)) return parseCif(clean, base);
  if (looksLikeCsv(clean)) return parseCsv(clean, base);
  throw new Error(`无法识别的文件格式：${fileName}`);
}

/* ------------------------------------------------------------------ */
/* SDF                                                                  */
/* ------------------------------------------------------------------ */

export function splitSdf(text) {
  return text
    .split(/\$\$\$\$/)
    .map((record) => record.replace(/^\s*\n/, "").trimEnd())
    .filter((record) => record.trim().length > 0);
}

function parseSdf(text, base) {
  const records = splitSdf(text);
  if (!records.length) throw new Error("SDF 中没有找到分子记录");

  const out = [];
  let failed = 0;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      const mol = ck.Molecule.fromSdf(record);
      if (!mol.numAtoms) throw new Error("空分子");
      const title = (record.split(/\r?\n/, 1)[0] || "").trim();
      out.push({
        name: title && title !== "$$$$" ? title : `${base} #${i + 1}`,
        kind: "molecule",
        format: "SDF",
        ck: mol,
        meta: {
          atoms: mol.numAtoms,
          bonds: mol.numBonds,
          conformers: mol.num3dConformers,
          records: records.length,
          molecularWeight: moleculeWeight(mol),
        },
      });
    } catch {
      failed += 1;
    }
  }
  if (!out.length) throw new Error("SDF 分子记录解析失败");
  if (failed) out[0].meta.note = `${failed} 条记录无法解析，已跳过`;
  return out;
}

/* ------------------------------------------------------------------ */
/* PDB / mmCIF                                                          */
/* ------------------------------------------------------------------ */

function parsePdb(text, base) {
  const out = [];

  let protein = null;
  try {
    protein = ck.Protein.fromPdb(text);
  } catch {
    protein = null;
  }

  if (protein && protein.numAtoms > 0) {
    out.push({
      name: base,
      kind: "protein",
      format: "PDB",
      ck: protein,
      meta: {
        atoms: protein.numAtoms,
        chains: protein.numChains,
        residues: protein.numResidues,
        models: protein.numModels,
        note: protein.numModels > 1 ? "多模型结构，当前显示第一个模型" : undefined,
      },
    });
  } else {
    // Nucleic acids, peptides without CA traces, or ligand-only files:
    // fall back to the full biological structure and render as a molecule.
    const bs = ck.BioStructure.fromPdb(text);
    try {
      const mol = bs.toMolecule();
      if (!mol.numAtoms) throw new Error("PDB 中没有可显示的原子");
      out.push({
        name: base,
        kind: "molecule",
        format: "PDB",
        ck: mol,
        nucleic: extractPdbBackbone(text),
        meta: {
          atoms: mol.numAtoms,
          bonds: mol.numBonds,
          molecularWeight: moleculeWeight(mol),
          note: "非蛋白/核酸结构，使用球棍模型显示",
        },
      });
    } finally {
      bs.free();
    }
  }

  // HETATM records (ligands, ions) are not part of the Protein projection.
  // Group by residue so a cofactor/ligand can be viewed on its own.
  const groups = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("HETATM") || line.length < 27) continue;
    const residue = line.slice(17, 20).trim().toUpperCase();
    if (residue === "HOH" || residue === "WAT" || residue === "DOD") continue;
    const chain = line.slice(21, 22).trim();
    const seq = line.slice(22, 26).trim();
    const key = `${residue}:${chain}:${seq}`;
    if (!groups.has(key)) groups.set(key, { residue, chain, seq, lines: [] });
    groups.get(key).lines.push(line);
  }
  for (const group of groups.values()) {
    try {
      const ligand = ck.Molecule.fromPdb(
        ["HEADER    MOLVIEWER LIGANDS", ...group.lines, "END"].join("\n")
      );
      if (!ligand.numAtoms) continue;
      const suffix = `${group.residue}${group.chain ? `:${group.chain}` : ""}${group.seq ? `#${group.seq}` : ""}`;
      out.push({
        name: `${base} · ${suffix}`,
        kind: "molecule",
        format: "PDB · HETATM",
        ck: ligand,
        meta: {
          atoms: ligand.numAtoms,
          bonds: ligand.numBonds,
          molecularWeight: moleculeWeight(ligand),
          note: "从 PDB 的 HETATM 记录中提取",
        },
      });
    } catch {
      /* single ions may not form a molecule; ignore */
    }
  }

  return out;
}

function parseCif(text, base) {
  const out = [];
  let protein = null;
  try {
    protein = ck.Protein.fromMmcif(text);
  } catch {
    protein = null;
  }

  if (protein && protein.numAtoms > 0) {
    out.push({
      name: base,
      kind: "protein",
      format: "mmCIF",
      ck: protein,
      meta: {
        atoms: protein.numAtoms,
        chains: protein.numChains,
        residues: protein.numResidues,
        models: protein.numModels,
        note: protein.numModels > 1 ? "多模型结构，当前显示第一个模型" : undefined,
      },
    });
  } else {
    const bs = ck.BioStructure.fromMmcif(text);
    try {
      const mol = bs.toMolecule();
      if (mol.numAtoms) {
        out.push({
          name: base,
          kind: "molecule",
          format: "mmCIF",
          ck: mol,
          nucleic: extractCifBackbone(text),
          meta: { atoms: mol.numAtoms, bonds: mol.numBonds, molecularWeight: moleculeWeight(mol), note: "非蛋白结构，使用球棍模型显示" },
        });
      }
    } finally {
      bs.free();
    }
  }

  out.push(...parseCifLigands(text, base));
  return out;
}

function parseCifLigands(text, base) {
  const lines = text.split(/\r?\n/);
  let index = 0;
  let columns = null;
  while (index < lines.length) {
    if (lines[index].trim().startsWith("_atom_site.")) {
      columns = [];
      while (index < lines.length && lines[index].trim().startsWith("_atom_site.")) {
        columns.push(lines[index].trim().slice("_atom_site.".length).trim());
        index += 1;
      }
      break;
    }
    index += 1;
  }
  if (!columns) return [];

  const rows = [];
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line || line.startsWith("#") || line.startsWith("loop_") || line.startsWith("_") || line.startsWith("data_")) break;
    const cells = line.split(/\s+/);
    if (cells.length >= columns.length) rows.push(cells);
    index += 1;
  }

  const column = (...names) => {
    for (const name of names) {
      const position = columns.indexOf(name);
      if (position >= 0) return position;
    }
    return -1;
  };
  const groupCol = column("group_PDB");
  const compCol = column("auth_comp_id", "label_comp_id");
  const chainCol = column("auth_asym_id", "label_asym_id");
  const seqCol = column("auth_seq_id", "label_seq_id");
  const atomCol = column("auth_atom_id", "label_atom_id");
  const elementCol = column("type_symbol");
  const xCol = column("Cartn_x");
  const yCol = column("Cartn_y");
  const zCol = column("Cartn_z");
  if ([groupCol, compCol, xCol, yCol, zCol].some((value) => value < 0)) return [];

  const groups = new Map();
  for (const row of rows) {
    if (row[groupCol] !== "HETATM") continue;
    const comp = row[compCol] || "LIG";
    if (["HOH", "WAT", "DOD"].includes(comp.toUpperCase())) continue;
    const chain = chainCol >= 0 ? row[chainCol] || "" : "";
    const seq = seqCol >= 0 ? row[seqCol] || "" : "";
    const key = `${comp}:${chain}:${seq}`;
    if (!groups.has(key)) groups.set(key, { comp, chain, seq, atoms: [] });
    groups.get(key).atoms.push({
      name: atomCol >= 0 ? row[atomCol] || comp : comp,
      comp,
      chain,
      seq,
      element: elementCol >= 0 ? row[elementCol] || "C" : "C",
      x: Number(row[xCol]),
      y: Number(row[yCol]),
      z: Number(row[zCol]),
    });
  }

  const out = [];
  let serial = 1;
  for (const group of [...groups.values()].slice(0, 100)) {
    const pdbLines = [];
    for (const atom of group.atoms) {
      if (![atom.x, atom.y, atom.z].every(Number.isFinite)) continue;
      const chain = (atom.chain || " ").slice(0, 1);
      pdbLines.push(
        `HETATM${String(serial++).padStart(5)} ${atom.name.padEnd(4)}${atom.comp.padStart(3)} ${chain}${String(atom.seq || 1).padStart(4)}    ` +
        `${atom.x.toFixed(3).padStart(8)}${atom.y.toFixed(3).padStart(8)}${atom.z.toFixed(3).padStart(8)}  1.00  0.00          ${atom.element.padStart(2)}`
      );
    }
    if (!pdbLines.length) continue;
    try {
      const ligand = ck.Molecule.fromPdb(["HEADER    MOLVIEWER LIGANDS", ...pdbLines, "END"].join("\n"));
      if (!ligand.numAtoms) continue;
      const suffix = `${group.comp}${group.chain ? `:${group.chain}` : ""}${group.seq ? `#${group.seq}` : ""}`;
      out.push({
        name: `${base} · ${suffix}`,
        kind: "molecule",
        format: "mmCIF · HETATM",
        ck: ligand,
        meta: {
          atoms: ligand.numAtoms,
          bonds: ligand.numBonds,
          molecularWeight: moleculeWeight(ligand),
          note: "从 mmCIF 的 HETATM 记录中提取",
        },
      });
    } catch {
      /* skip unparsable ions */
    }
  }
  return out;
}

function parseMol2(text, base) {
  const mol = ck.Molecule.fromMol2(text);
  if (!mol.numAtoms) throw new Error("MOL2 中没有原子");
  return [{
    name: base,
    kind: "molecule",
    format: "MOL2",
    ck: mol,
    meta: {
      atoms: mol.numAtoms,
      bonds: mol.numBonds,
      conformers: mol.num3dConformers,
      molecularWeight: moleculeWeight(mol),
    },
  }];
}

function parseXyz(text, base) {
  const mol = ck.Molecule.fromXyzBlock(text);
  if (!mol.numAtoms) throw new Error("XYZ 中没有原子");
  return [{
    name: base,
    kind: "molecule",
    format: "XYZ",
    ck: mol,
    meta: {
      atoms: mol.numAtoms,
      bonds: mol.numBonds,
      conformers: mol.num3dConformers,
      molecularWeight: moleculeWeight(mol),
    },
  }];
}

/* ------------------------------------------------------------------ */
/* CSV                                                                  */
/* ------------------------------------------------------------------ */

function looksLikeCsv(text) {
  const first = text.split(/\r?\n/, 1)[0] || "";
  return first.includes(",") || first.includes(";") || first.includes("\t");
}

export function previewCsv(text, options = {}) {
  const delimiter = options.delimiter || detectDelimiter(text);
  const rows = parseDelimited(text, delimiter);
  const header = options.header !== false;
  const headers = header
    ? (rows[0] || []).map((value) => String(value ?? "").trim())
    : (rows[0] || []).map((_, index) => `列 ${index + 1}`);
  const data = header ? rows.slice(1) : rows;
  return {
    delimiter,
    header,
    headers,
    preview: data.slice(0, 6),
    rows: data,
    total: data.length,
  };
}

export function parseCsvWithMapping(text, base, mapping) {
  return parseCsv(text, base, mapping);
}

function parseCsv(text, base, mapping = null) {
  const rows = parseDelimited(text, mapping?.delimiter || null);
  const hasHeader = mapping ? mapping.header !== false : true;
  if (rows.length < (hasHeader ? 2 : 1)) throw new Error("CSV 需要表头和至少一行数据");

  const headers = hasHeader
    ? rows[0].map(normalizeHeader)
    : rows[0].map((_, index) => `col${index}`);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const find = (...candidates) => {
    for (const name of candidates) {
      const index = headers.indexOf(normalizeHeader(name));
      if (index >= 0) return index;
    }
    return -1;
  };

  const smilesIndex = mapping && mapping.mode === "smiles"
    ? Number(mapping.smilesCol)
    : find("smiles", "canonicalsmiles", "canonical_smiles", "isomericsmiles", "smilesstring");
  const nameIndex = mapping && mapping.mode === "smiles"
    ? Number(mapping.nameCol ?? -1)
    : find("name", "id", "title", "compound", "ligand", "identifier");

  if (smilesIndex >= 0) {
    const out = [];
    let skipped = 0;
    const limitedRows = dataRows.slice(0, MAX_SMILES_ROWS);
    for (const row of limitedRows) {
      const smiles = (row[smilesIndex] || "").trim();
      if (!smiles) continue;
      try {
        const mol = ck.Molecule.fromSmiles(smiles);
        if (!mol.numAtoms) throw new Error("空分子");
        const label = nameIndex >= 0 ? (row[nameIndex] || "").trim() : "";
        out.push({
          name: label || `${base} #${out.length + 1}`,
          kind: "molecule",
          format: "CSV → SMILES",
          ck: mol,
          needsEmbed: true,
          meta: {
            atoms: mol.numAtoms,
            smiles,
            molecularWeight: moleculeWeight(mol),
            note: "3D 坐标在显示时生成",
          },
        });
      } catch {
        skipped += 1;
      }
    }
    if (!out.length) throw new Error("CSV 中没有可解析的 SMILES");
    if (skipped) out[0].meta.note = `${skipped} 行 SMILES 无法解析，已跳过`;
    if (dataRows.length > MAX_SMILES_ROWS) {
      out[0].meta.note = `${out[0].meta.note || ""} 仅载入前 ${MAX_SMILES_ROWS} 行`;
    }
    return out;
  }

  const xIndex = mapping && mapping.mode === "coords" ? Number(mapping.xCol) : find("x", "coordx", "xcoordinate");
  const yIndex = mapping && mapping.mode === "coords" ? Number(mapping.yCol) : find("y", "coordy", "ycoordinate");
  const zIndex = mapping && mapping.mode === "coords" ? Number(mapping.zCol) : find("z", "coordz", "zcoordinate");
  const elementIndex = mapping && mapping.mode === "coords" ? Number(mapping.elementCol) : find("element", "symbol", "atom", "el", "atomsymbol");

  if (xIndex >= 0 && yIndex >= 0 && zIndex >= 0 && elementIndex >= 0) {
    const atoms = [];
    for (const row of dataRows) {
      if (atoms.length >= MAX_COORD_ATOMS) break;
      const element = normalizeElement(row[elementIndex]);
      const x = Number(row[xIndex]);
      const y = Number(row[yIndex]);
      const z = Number(row[zIndex]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      if (!element) continue;
      atoms.push({ element, x, y, z });
    }
    if (!atoms.length) throw new Error("CSV 中没有有效的原子坐标");

    const canInfer = atoms.length <= MAX_BOND_ATOMS;
    const bonds = canInfer ? inferBonds(atoms) : [];
    const mol = ck.Molecule.fromSdf(buildMolBlock(base, atoms, bonds), { removeHs: false });

    return [{
      name: base,
      kind: "molecule",
      format: "CSV → XYZ",
      ck: mol,
      meta: {
        atoms: mol.numAtoms,
        bonds: mol.numBonds,
        molecularWeight: moleculeWeight(mol),
        note: canInfer
          ? "键由共价半径推断，仅适合小分子"
          : `原子数超过 ${MAX_BOND_ATOMS}，已跳过键推断`,
      },
    }];
  }

  throw new Error("无法识别的 CSV：需要 smiles 列，或 element,x,y,z 列");
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  return [",", ";", "\t"]
    .map((candidate) => ({ candidate, count: firstLine.split(candidate).length }))
    .sort((a, b) => b.count - a.count)[0].candidate;
}

function parseDelimited(text, forcedDelimiter = null) {
  const delimiter = forcedDelimiter || detectDelimiter(text);

  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => String(cell).trim() !== ""));
}

function normalizeHeader(value) {
  return String(value ?? "").toLowerCase().replace(/["'\s_\-().]/g, "");
}

function normalizeElement(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const named = ELEMENT_NAMES[value.toLowerCase()];
  if (named) return named;
  const symbol = value[0].toUpperCase() + value.slice(1).toLowerCase();
  return /^[A-Z][a-z]?$/.test(symbol) ? symbol : "";
}

/* ------------------------------------------------------------------ */
/* atom table → MOL V2000                                               */
/* ------------------------------------------------------------------ */

function inferBonds(atoms) {
  const candidates = [];
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const a = atoms[i];
      const b = atoms[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      const distance2 = dx * dx + dy * dy + dz * dz;
      if (distance2 < 0.16) continue;
      const radius = (RADII[a.element.toUpperCase()] ?? 0.77) + (RADII[b.element.toUpperCase()] ?? 0.77);
      const cutoff = radius * 1.3;
      if (distance2 <= cutoff * cutoff) candidates.push([distance2, i, j]);
    }
  }
  candidates.sort((a, b) => a[0] - b[0]);

  const degree = new Array(atoms.length).fill(0);
  const bonds = [];
  for (const [, i, j] of candidates) {
    const maxI = MAX_BONDS[atoms[i].element.toUpperCase()] ?? 8;
    const maxJ = MAX_BONDS[atoms[j].element.toUpperCase()] ?? 8;
    if (degree[i] >= maxI || degree[j] >= maxJ) continue;
    degree[i] += 1;
    degree[j] += 1;
    bonds.push([i + 1, j + 1, 1]);
  }
  return bonds;
}

function buildMolBlock(name, atoms, bonds) {
  const title = String(name || "molecule").split(/\r?\n/, 1)[0].slice(0, 80) || "molecule";
  const atomLines = atoms.map((atom) =>
    `${fixed(atom.x)}${fixed(atom.y)}${fixed(atom.z)} ${atom.element.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`
  );
  const bondLines = bonds.map(([a, b, order]) =>
    `${String(a).padStart(3)}${String(b).padStart(3)}${String(order).padStart(3)}  0`
  );
  return [
    title,
    "  MolVision".padEnd(20) + "3D",
    "",
    `${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`,
    ...atomLines,
    ...bondLines,
    "M  END",
    "",
  ].join("\n");
}

function fixed(value) {
  return Number(value).toFixed(4).padStart(10);
}

function moleculeWeight(mol) {
  try {
    return mol.molecularWeight();
  } catch {
    return undefined;
  }
}

const NUCLEIC_BASE_ATOMS = new Set([
  "N1", "C2", "N3", "C4", "C5", "C6", "N7", "C8", "N9",
  "O2", "N2", "O4", "N4", "O6", "N6", "C7", "C5M",
]);

function baseOrder(residue) {
  if (/^[AG]/i.test(residue)) return ["N9", "C8", "N7", "C5", "C6", "N1", "C2", "N3", "C4"];
  return ["N1", "C2", "N3", "C4", "C5", "C6"];
}

function baseColor(residue) {
  const letter = (residue || "").replace(/^[DR]/i, "").slice(-1).toUpperCase();
  if (letter === "A") return [90, 210, 120];
  if (letter === "T" || letter === "U") return [255, 130, 110];
  if (letter === "G") return [255, 205, 80];
  if (letter === "C") return [100, 170, 255];
  return [200, 200, 200];
}

function finishNucleicChains(map) {
  const chains = [];
  for (const [id, residues] of map.entries()) {
    const ordered = [...residues.values()].sort((a, b) => a.seq - b.seq);
    const kept = ordered.filter((residue) => residue.atoms.has("P"));
    if (kept.length < 2) continue;
    chains.push({
      id,
      points: kept.map((residue) => residue.atoms.get("P")),
      residues: kept.map((residue) => {
        const base = baseOrder(residue.name)
          .filter((name) => residue.atoms.has(name))
          .map((name) => ({ name, point: residue.atoms.get(name) }));
        return {
          seq: residue.seq,
          name: residue.name,
          p: residue.atoms.get("P"),
          c1: residue.atoms.get("C1'") || residue.atoms.get("C1*") || null,
          base,
        };
      }),
    });
  }
  return chains;
}

function extractPdbBackbone(text) {
  const chains = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("ATOM") || line.length < 54) continue;
    const atomName = line.slice(12, 16).trim();
    const residueName = line.slice(17, 20).trim().toUpperCase();
    if (!atomName) continue;
    const chainId = line.slice(21, 22).trim() || "A";
    const seq = Number(line.slice(22, 26).trim());
    if (!Number.isFinite(seq)) continue;
    const x = Number(line.slice(30, 38));
    const y = Number(line.slice(38, 46));
    const z = Number(line.slice(46, 54));
    if (![x, y, z].every(Number.isFinite)) continue;
    if (!/^[DR]?(A|C|G|T|U)$/i.test(residueName)) continue;

    if (!chains.has(chainId)) chains.set(chainId, new Map());
    const residues = chains.get(chainId);
    if (!residues.has(seq)) residues.set(seq, { seq, name: residueName, atoms: new Map() });
    residues.get(seq).atoms.set(atomName, [x, y, z]);
  }
  return finishNucleicChains(chains);
}

function extractCifBackbone(text) {
  const lines = text.split(/\r?\n/);
  let index = 0;
  let columns = null;
  while (index < lines.length) {
    if (lines[index].trim().startsWith("_atom_site.")) {
      columns = [];
      while (index < lines.length && lines[index].trim().startsWith("_atom_site.")) {
        columns.push(lines[index].trim().slice("_atom_site.".length).trim());
        index += 1;
      }
      break;
    }
    index += 1;
  }
  if (!columns) return [];
  const rows = [];
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line || line.startsWith("#") || line.startsWith("loop_") || line.startsWith("_") || line.startsWith("data_")) break;
    const cells = line.split(/\s+/);
    if (cells.length >= columns.length) rows.push(cells);
    index += 1;
  }
  const column = (...names) => {
    for (const name of names) {
      const position = columns.indexOf(name);
      if (position >= 0) return position;
    }
    return -1;
  };
  const atomCol = column("auth_atom_id", "label_atom_id");
  const compCol = column("auth_comp_id", "label_comp_id");
  const chainCol = column("auth_asym_id", "label_asym_id");
  const seqCol = column("auth_seq_id", "label_seq_id");
  const xCol = column("Cartn_x");
  const yCol = column("Cartn_y");
  const zCol = column("Cartn_z");
  if ([atomCol, compCol, chainCol, xCol, yCol, zCol].some((value) => value < 0)) return [];

  const chains = new Map();
  rows.forEach((row, order) => {
    const residueName = (row[compCol] || "").toUpperCase();
    if (!/^[DR]?(A|C|G|T|U)$/i.test(residueName)) return;
    const atomName = row[atomCol];
    if (!atomName) return;
    const chainId = row[chainCol] || "A";
    const seq = seqCol >= 0 ? Number(row[seqCol]) : order;
    const x = Number(row[xCol]);
    const y = Number(row[yCol]);
    const z = Number(row[zCol]);
    if (![x, y, z].every(Number.isFinite)) return;
    if (!chains.has(chainId)) chains.set(chainId, new Map());
    const residues = chains.get(chainId);
    const key = Number.isFinite(seq) ? seq : order;
    if (!residues.has(key)) residues.set(key, { seq: key, name: residueName, atoms: new Map() });
    residues.get(key).atoms.set(atomName, [x, y, z]);
  });
  return finishNucleicChains(chains);
}
