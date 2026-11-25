/** Background file reading + Cosmolkit parsing for SDF/MOL2/XYZ. */
import * as ck from "./node_modules/@cosmol-studio/cosmolkit/cosmolkit_wasm.js";

let ready = null;
async function init() {
  if (!ready) ready = ck.default();
  await ready;
}

function decode(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gb18030").decode(bytes);
  }
}

async function readBytes(file) {
  let bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.gz$/i.test(file.name)) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return bytes;
}

function stripGzip(name) {
  return name.replace(/\.gz$/i, "");
}

function isSdf(name) {
  return /\.(sdf|mol)$/i.test(name);
}

function isCsv(name) {
  return /\.(csv|tsv)$/i.test(name);
}

function moleculeEntry(molecule, name, format) {
  const meta = {
    atoms: molecule.numAtoms,
    bonds: molecule.numBonds,
    conformers: molecule.num3dConformers,
    molecularWeight: (() => { try { return molecule.molecularWeight(); } catch { return undefined; } })(),
  };
  const data = molecule.toTransferBinary();
  molecule.free?.();
  return { name, kind: "molecule", format, type: "molecule", data, meta };
}

self.onmessage = async (event) => {
  const { id, files } = event.data || {};
  try {
    await init();
    const result = [];
    for (const file of files || []) {
      const logicalName = stripGzip(file.name);
      const text = decode(await readBytes(file));
      if (isSdf(logicalName)) {
        const records = text.split(/\$\$\$\$/).map((record) => record.trim()).filter(Boolean);
        const entries = [];
        for (let index = 0; index < records.length; index += 1) {
          try {
            const molecule = ck.Molecule.fromSdf(records[index]);
            if (!molecule.numAtoms) { molecule.free?.(); continue; }
            const title = (records[index].split(/\r?\n/, 1)[0] || "").trim();
            const name = title && title !== "$$$$" ? title : `${logicalName.replace(/\.[^.]+$/, "")} #${index + 1}`;
            entries.push(moleculeEntry(molecule, name, "SDF"));
          } catch {
            /* skip bad record */
          }
        }
        result.push({ name: logicalName, entries });
      } else if (/\.mol2$/i.test(logicalName)) {
        const molecule = ck.Molecule.fromMol2(text);
        result.push({ name: logicalName, entries: [moleculeEntry(molecule, logicalName.replace(/\.[^.]+$/, ""), "MOL2")] });
      } else if (/\.xyz$/i.test(logicalName)) {
        const molecule = ck.Molecule.fromXyzBlock(text);
        result.push({ name: logicalName, entries: [moleculeEntry(molecule, logicalName.replace(/\.[^.]+$/, ""), "XYZ")] });
      } else {
        result.push({ name: logicalName, text, csv: isCsv(logicalName) });
      }
    }
    self.postMessage({ id, ok: true, files: result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message || error) });
  }
};
