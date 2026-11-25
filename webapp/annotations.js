/**
 * 3D annotation layer: projects COSMol camera state to screen coordinates and
 * draws labels / distance measurements on a transparent canvas.
 *
 * The same `draw` path is reused for high-resolution export, so what you see
 * is what gets written to the PNG.
 */

import { angleDegrees, buildMeasurement, dihedralDegrees } from "./chem-math.js";

const FOV_FALLBACK = 15;


export class AnnotationLayer {
  constructor({ viewer, stage, baseCanvas, overlay, onChange, onSelect }) {
    this.viewer = viewer;
    this.stage = stage;
    this.base = baseCanvas;
    this.overlay = overlay;
    this.ctx = overlay.getContext("2d");
    this.onChange = onChange || (() => {});
    this.onSelect = onSelect || (() => {});
    this.entry = null;
    this.mode = "browse";
    this.pending = [];
    this.hover = null;
    this._down = null;
    this._draggingLabel = null;
    this.labelBoxes = [];
    this._dirty = true;
    this._lastCamera = null;
    this._frame = 0;

    this._onPointerDown = (event) => this._pointerDown(event);
    this._onPointerUp = (event) => this._pointerUp(event);
    this._onResize = () => this._resize();
    stage.addEventListener("pointerdown", this._onPointerDown, true);
    stage.addEventListener("pointerup", this._onPointerUp, true);
    this._onLabelDown = (event) => this._labelDown(event);
    this._onLabelMove = (event) => this._labelMove(event);
    this._onLabelUp = (event) => this._labelUp(event);
    overlay.addEventListener("pointerdown", this._onLabelDown);
    overlay.addEventListener("pointermove", this._onLabelMove);
    overlay.addEventListener("pointerup", this._onLabelUp);
    overlay.addEventListener("pointercancel", this._onLabelUp);
    window.addEventListener("resize", this._onResize);
    this._resize();
    this._loop();
  }

  setEntry(entry) {
    this.entry = entry;
    this.pending = [];
    this._dirty = true;
    if (entry) {
      entry.labels ||= [];
      entry.measurements ||= [];
      entry.history ||= [];
      entry.future ||= [];
      this._buildPickables(entry);
    }
    this._updateCursor();
    this.onChange();
    this.draw();
  }

  _snapshot() {
    return {
      labels: JSON.parse(JSON.stringify(this.entry?.labels || [])),
      measurements: JSON.parse(JSON.stringify(this.entry?.measurements || [])),
    };
  }

  pushHistory() {
    if (!this.entry) return;
    this.entry.history ||= [];
    this.entry.future ||= [];
    this.entry.history.push(this._snapshot());
    if (this.entry.history.length > 60) this.entry.history.shift();
    this.entry.future = [];
  }

  canUndo() {
    return Boolean(this.entry?.history?.length);
  }

  canRedo() {
    return Boolean(this.entry?.future?.length);
  }

  undo() {
    if (!this.entry?.history?.length) return;
    this.entry.future ||= [];
    this.entry.future.push(this._snapshot());
    const previous = this.entry.history.pop();
    this.entry.labels = previous.labels;
    this.entry.measurements = previous.measurements;
    this.pending = [];
    this.onChange();
    this._dirty = true;
    this.draw();
  }

  redo() {
    if (!this.entry?.future?.length) return;
    this.entry.history ||= [];
    this.entry.history.push(this._snapshot());
    const next = this.entry.future.pop();
    this.entry.labels = next.labels;
    this.entry.measurements = next.measurements;
    this.pending = [];
    this.onChange();
    this._dirty = true;
    this.draw();
  }

  addLabel(picked) {
    if (!this.entry || !picked) return;
    const exists = this.entry.labels.some((label) => label.key === picked.key);
    if (exists) return;
    this.pushHistory();
    this.entry.labels.push({
      id: `l${Date.now()}${Math.floor(Math.random() * 1000)}`,
      key: picked.key,
      kind: this.entry.kind === "protein" ? "residue" : "atom",
      text: picked.text,
      position: picked.position,
      color: this.entry.kind === "protein" ? "#8ee7c8" : "#ffd166",
    });
    this.onChange();
    this._dirty = true;
    this.draw();
  }

  setMode(mode) {
    this.mode = mode;
    this.pending = [];
    this._updateCursor();
    this.draw();
  }

  deleteLabel(id) {
    if (!this.entry) return;
    this.pushHistory();
    this.entry.labels = this.entry.labels.filter((label) => label.id !== id);
    this.onChange();
    this.draw();
  }

  deleteMeasurement(id) {
    if (!this.entry) return;
    this.pushHistory();
    this.entry.measurements = this.entry.measurements.filter((item) => item.id !== id);
    this.onChange();
    this.draw();
  }

  clear() {
    if (!this.entry) return;
    if (!this.entry.labels.length && !this.entry.measurements.length) return;
    this.pushHistory();
    this.entry.labels = [];
    this.entry.measurements = [];
    this.pending = [];
    this.onChange();
    this.draw();
  }

  /* ---------------------------------------------------------------- */
  /* picking                                                          */
  /* ---------------------------------------------------------------- */

  _buildPickables(entry) {
    entry.atomPickables = [];
    entry.residuePickables = [];

    if (!entry.ck) return;

    if (entry.kind === "protein") {
      const residues = new Map();
      for (const atom of entry.ck.atoms || []) {
        const position = atom.position;
        if (!position) continue;
        const residue = atom.residue;
        const residueKey = residue ? `${residue.chain?.id ?? ""}:${residue.id}` : null;
        entry.atomPickables.push({
          key: `a${atom.id}`,
          position: [position[0], position[1], position[2]],
          label: atom.name || "?",
          text: `${atom.name || "?"}`,
          residueKey,
        });
        if (residue && residueKey) {
          const existing = residues.get(residueKey);
          if (!existing) {
            const chainId = residue.chain?.row?.source?.authChainId?.asStr?.()
              || residue.chain?.row?.source?.labelAsymId
              || "";
            const seq = residue.row?.source?.seqId;
            const seqText = seq
              ? `${seq.seqNum}${seq.insCode ? String.fromCharCode(seq.insCode) : ""}`
              : String(residue.id ?? "");
            residues.set(residueKey, {
              key: `r${residueKey}`,
              position: [position[0], position[1], position[2]],
              label: residue.name || "?",
              text: `${chainId ? `${chainId}:` : ""}${residue.name || "?"}${seqText}`,
              residueKey,
            });
          } else if (atom.name === "CA") {
            existing.position = [position[0], position[1], position[2]];
          }
        }
      }
      entry.residuePickables = [...residues.values()];
    } else {
      const coords = entry.ck.coordinates3d?.(0) || [];
      const atoms = entry.ck.atoms || [];
      coords.forEach((position, index) => {
        entry.atomPickables.push({
          key: `a${index}`,
          position: [position[0], position[1], position[2]],
          label: atoms[index]?.element?.symbol || "?",
          text: `${atoms[index]?.element?.symbol || "?"}${index + 1}`,
          residueKey: null,
        });
      });
    }
  }

  _camera() {
    const raw = this.viewer?.cameraState?.();
    if (!raw || raw.length < 8) return null;
    return {
      azimuth: raw[0],
      elevation: raw[1],
      roll: raw[2],
      distance: raw[3],
      target: [raw[4], raw[5], raw[6]],
      fov: raw[7] || FOV_FALLBACK,
    };
  }

  _basis(camera) {
    const az = (camera.azimuth * Math.PI) / 180;
    const el = (camera.elevation * Math.PI) / 180;
    const roll = (camera.roll * Math.PI) / 180;

    const rotate = (v) => {
      // R = Ry(az) * Rx(el) * Rz(roll)
      let [x, y, z] = v;
      let c = Math.cos(roll);
      let s = Math.sin(roll);
      [x, y, z] = [x * c - y * s, x * s + y * c, z];
      c = Math.cos(el);
      s = Math.sin(el);
      [x, y, z] = [x, y * c - z * s, y * s + z * c];
      c = Math.cos(az);
      s = Math.sin(az);
      [x, y, z] = [x * c + z * s, y, -x * s + z * c];
      return [x, y, z];
    };

    const forward = rotate([0, 0, -1]);
    const up = rotate([0, 1, 0]);
    const right = rotate([1, 0, 0]);
    const eye = [
      camera.target[0] - forward[0] * camera.distance,
      camera.target[1] - forward[1] * camera.distance,
      camera.target[2] - forward[2] * camera.distance,
    ];
    return { forward, up, right, eye, fov: camera.fov };
  }

  /** Project a world point into base-canvas pixels. */
  _project(point, camera, basis) {
    if (!camera) return null;
    const scale = this.entry?.scale || 1;
    const p = [point[0] * scale, point[1] * scale, point[2] * scale];
    const dx = p[0] - basis.eye[0];
    const dy = p[1] - basis.eye[1];
    const dz = p[2] - basis.eye[2];
    const z = dx * basis.forward[0] + dy * basis.forward[1] + dz * basis.forward[2];
    if (z <= 0.001) return null;

    const aspect = this.base.width / Math.max(1, this.base.height);
    const tan = Math.tan((basis.fov * Math.PI) / 360);
    const nx = (dx * basis.right[0] + dy * basis.right[1] + dz * basis.right[2]) / (z * tan * aspect);
    const ny = (dx * basis.up[0] + dy * basis.up[1] + dz * basis.up[2]) / (z * tan);
    return {
      x: (nx * 0.5 + 0.5) * this.base.width,
      y: (0.5 - ny * 0.5) * this.base.height,
      z,
    };
  }

  projectAll() {
    const camera = this._camera();
    if (!camera || !this.entry) return [];
    const basis = this._basis(camera);
    return (this.entry.atomPickables || [])
      .map((item) => {
        const projected = this._project(item.position, camera, basis);
        return projected ? { ...projected, key: item.key, text: item.text } : null;
      })
      .filter(Boolean);
  }

  _pickAt(clientX, clientY) {
    if (!this.entry) return null;
    const camera = this._camera();
    if (!camera) return null;
    const basis = this._basis(camera);
    const rect = this.base.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    const thresholdX = (10 * this.base.width) / Math.max(1, rect.width);
    const thresholdY = (10 * this.base.height) / Math.max(1, rect.height);

    const source =
      this.mode === "browse" || ["measure", "angle", "dihedral"].includes(this.mode)
        ? this.entry.atomPickables
        : this.entry.kind === "protein"
          ? this.entry.residuePickables
          : this.entry.atomPickables;

    let best = null;
    let bestDistance = Infinity;
    for (const item of source || []) {
      const projected = this._project(item.position, camera, basis);
      if (!projected) continue;
      const dx = (projected.x - cssX * (this.base.width / Math.max(1, rect.width))) / thresholdX;
      const dy = (projected.y - cssY * (this.base.height / Math.max(1, rect.height))) / thresholdY;
      const distance = dx * dx + dy * dy;
      if (distance < 1 && distance < bestDistance) {
        bestDistance = distance;
        best = item;
      }
    }
    return best;
  }

  _labelHit(clientX, clientY) {
    const rect = this.overlay.getBoundingClientRect();
    const x = ((clientX - rect.left) * this.base.width) / Math.max(1, rect.width);
    const y = ((clientY - rect.top) * this.base.height) / Math.max(1, rect.height);
    for (const item of this.labelBoxes) {
      const { box } = item;
      if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) return item;
    }
    return null;
  }

  _labelDown(event) {
    if (this.mode !== "label" || !this.entry) return;
    const hit = this._labelHit(event.clientX, event.clientY);
    if (!hit) return;
    this.pushHistory();
    this._draggingLabel = {
      label: hit.label,
      startX: event.clientX,
      startY: event.clientY,
      dx: hit.label.dx || 0,
      dy: hit.label.dy || 0,
    };
    event.preventDefault();
    event.stopPropagation();
  }

  _labelMove(event) {
    if (!this._draggingLabel) return;
    const rect = this.overlay.getBoundingClientRect();
    const scale = this._scale();
    const dx = ((event.clientX - this._draggingLabel.startX) * this.base.width) / Math.max(1, rect.width) / scale;
    const dy = ((event.clientY - this._draggingLabel.startY) * this.base.height) / Math.max(1, rect.height) / scale;
    this._draggingLabel.label.dx = this._draggingLabel.dx + dx;
    this._draggingLabel.label.dy = this._draggingLabel.dy + dy;
    this._draggingLabel.startX = event.clientX;
    this._draggingLabel.startY = event.clientY;
    this._draggingLabel.dx = this._draggingLabel.label.dx;
    this._draggingLabel.dy = this._draggingLabel.label.dy;
    this._dirty = true;
    this.draw();
    event.preventDefault();
  }

  _labelUp(event) {
    if (!this._draggingLabel) return;
    this._draggingLabel = null;
    event.preventDefault();
    event.stopPropagation();
  }

  _pointerDown(event) {
    if (event.button !== 0 || !this.entry) return;
    this._down = { x: event.clientX, y: event.clientY, time: performance.now() };
  }

  _pointerUp(event) {
    if (this._draggingLabel) {
      this._down = null;
      return;
    }
    if (event.button !== 0 || !this._down || !this.entry) return;
    const moved = Math.hypot(event.clientX - this._down.x, event.clientY - this._down.y);
    this._down = null;
    if (moved > 5) return;

    const picked = this._pickAt(event.clientX, event.clientY);
    if (!picked) return;

    if (this.mode === "browse") {
      this.entry.selectedKey = picked.key;
      this.entry.selectedText = picked.text;
      this._dirty = true;
      this.onSelect(this.entry);
      this.draw();
      return;
    }

    if (this.mode === "label") {
      this.addLabel(picked);
    } else if (["measure", "angle", "dihedral"].includes(this.mode)) {
      const required = this.mode === "measure" ? 2 : this.mode === "angle" ? 3 : 4;
      if (!this.pending.some((item) => item.key === picked.key)) {
        this.pending.push(picked);
      }
      if (this.pending.length >= required) {
        const atoms = this.pending.slice(0, required);
        const measurement = buildMeasurement(this.mode, atoms);
        if (measurement) {
          this.pushHistory();
          this.entry.measurements.push(measurement);
        }
        this.pending = [];
        this.onChange();
      }
    }
    this._dirty = true;
    this.draw();
  }

  /* ---------------------------------------------------------------- */
  /* drawing                                                          */
  /* ---------------------------------------------------------------- */

  _resize() {
    const rect = this.overlay.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.overlay.width = Math.max(1, Math.round(rect.width * dpr));
    this.overlay.height = Math.max(1, Math.round(rect.height * dpr));
    this._dirty = true;
  }

  _loop() {
    const tick = () => {
      const camera = this._camera();
      if (camera && this._changed(camera)) this._dirty = true;
      if (this._dirty) this.draw();
      this._frame = requestAnimationFrame(tick);
    };
    this._frame = requestAnimationFrame(tick);
  }

  _changed(camera) {
    const last = this._lastCamera;
    if (!last) return true;
    return (
      Math.abs(last.azimuth - camera.azimuth) > 0.01 ||
      Math.abs(last.elevation - camera.elevation) > 0.01 ||
      Math.abs(last.roll - camera.roll) > 0.01 ||
      Math.abs(last.distance - camera.distance) > 0.01 ||
      Math.abs(last.fov - camera.fov) > 0.01 ||
      last.target.some((value, index) => Math.abs(value - camera.target[index]) > 0.001)
    );
  }

  draw() {
    const ctx = this.ctx;
    const rect = this.overlay.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    if (!this.entry) {
      this._dirty = false;
      return;
    }

    const camera = this._camera();
    if (!camera) {
      this._dirty = false;
      return;
    }
    this._lastCamera = camera;
    const basis = this._basis(camera);

    // Draw in COSMol base-canvas coordinates, scaled to the overlay.
    const sx = (rect.width / Math.max(1, this.base.width)) * dpr;
    const sy = (rect.height / Math.max(1, this.base.height)) * dpr;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    this._drawContent(ctx, camera, basis);
    this._dirty = false;
  }

  /** Draw annotations into an external context at a different resolution. */
  renderTo(ctx, width, height) {
    const camera = this._camera();
    if (!camera || !this.entry) return;
    const basis = this._basis(camera);
    ctx.save();
    ctx.setTransform(
      width / Math.max(1, this.base.width),
      0,
      0,
      height / Math.max(1, this.base.height),
      0,
      0
    );
    this._drawContent(ctx, camera, basis);
    ctx.restore();
  }

  _drawContent(ctx, camera, basis) {
    for (const measurement of this.entry.measurements || []) {
      const atoms = measurement.atoms
        || (measurement.a && measurement.b ? [measurement.a, measurement.b] : []);
      if (atoms.length < 2) continue;
      const points = atoms.map((atom) => this._project(atom.position, camera, basis));
      if (points.some((point) => !point)) continue;
      this._drawMeasurement(ctx, points, measurement, this._scale());
    }

    for (const item of this.pending) {
      const point = this._project(item.position, camera, basis);
      if (point) this._drawMarker(ctx, point, "#ffd166");
    }

    if (this.entry.selectedKey) {
      const selected = (this.entry.atomPickables || []).find((item) => item.key === this.entry.selectedKey);
      const point = selected ? this._project(selected.position, camera, basis) : null;
      if (point) {
        const scale = this._scale();
        ctx.save();
        ctx.strokeStyle = "#4cc2ff";
        ctx.lineWidth = 2 * scale;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 9 * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    const scale = this._scale();
    ctx.font = `600 ${13 * scale}px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
    const placed = [];
    this.labelBoxes = [];
    for (const label of this.entry.labels || []) {
      const point = this._project(label.position, camera, basis);
      if (!point) continue;
      const textWidth = ctx.measureText(label.text).width;
      const width = textWidth + 10 * scale;
      const height = 13 * scale + 6 * scale;
      const offsetX = (label.dx || 0) * scale;
      const offsetY = (label.dy || 0) * scale;
      const candidates = [
        [9, -height - 4],
        [9, 4],
        [-width - 9, -height - 4],
        [-width - 9, 4],
        [9, -height / 2],
        [-width - 9, -height / 2],
        [9, -height - 18],
        [-width - 9, -height - 18],
      ];
      let box = null;
      for (const [ox, oy] of candidates) {
        const rect = { x: point.x + ox * scale + offsetX, y: point.y + oy * scale + offsetY, width, height };
        const hits = placed.some(
          (other) =>
            rect.x < other.x + other.width + 2 &&
            rect.x + rect.width + 2 > other.x &&
            rect.y < other.y + other.height + 2 &&
            rect.y + rect.height + 2 > other.y
        );
        if (!hits) {
          box = rect;
          break;
        }
      }
      if (!box) box = { x: point.x + 9 * scale + offsetX, y: point.y - height - 10 * scale + offsetY, width, height };
      placed.push(box);
      this.labelBoxes.push({ label, box });
      this._drawLabelBox(ctx, point, label, box, scale);
    }
  }

  _scale() {
    return Math.max(0.75, this.base.width / 1100);
  }

  _drawMarker(ctx, point, color) {
    const scale = this._scale();
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawLabelBox(ctx, point, label, box, scale) {
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(120, 160, 210, 0.55)";
    ctx.lineWidth = 1 * scale;
    const leaderX = Math.max(box.x, Math.min(point.x, box.x + box.width));
    const leaderY = Math.max(box.y, Math.min(point.y, box.y + box.height));
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(leaderX, leaderY);
    ctx.stroke();

    ctx.fillStyle = "rgba(7, 11, 20, 0.82)";
    this._roundRect(ctx, box.x, box.y, box.width, box.height, 5 * scale);
    ctx.fill();
    ctx.strokeStyle = "rgba(120, 160, 210, 0.45)";
    ctx.stroke();

    ctx.fillStyle = label.color || "#e6edf7";
    ctx.fillText(label.text, box.x + 5 * scale, box.y + box.height / 2 + 0.5);
    ctx.restore();
  }

  _drawMeasurement(ctx, points, measurement, scale) {
    const type = measurement.type || "distance";
    if (type === "angle" && points.length >= 3) {
      this._drawAngle(ctx, points[0], points[1], points[2], measurement, scale);
    } else if (type === "dihedral" && points.length >= 4) {
      this._drawDihedral(ctx, points[0], points[1], points[2], points[3], measurement, scale);
    } else {
      this._drawDistance(ctx, points[0], points[1], measurement, scale);
    }
  }

  _dashedLine(ctx, a, b, color, scale) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4 * scale;
    ctx.setLineDash([5 * scale, 4 * scale]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  _drawDistance(ctx, a, b, measurement, scale) {
    this._dashedLine(ctx, a, b, "#ffd166", scale);
    this._drawMarker(ctx, a, "#ffd166");
    this._drawMarker(ctx, b, "#ffd166");
    const text = measurement.text || `${(measurement.distance ?? measurement.value ?? 0).toFixed(2)} Å`;
    this._drawValueTag(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2 - 6 * scale, text, scale, "#ffe4a0");
  }

  _drawAngle(ctx, a, b, c, measurement, scale) {
    this._dashedLine(ctx, a, b, "#8fd3ff", scale);
    this._dashedLine(ctx, b, c, "#8fd3ff", scale);
    this._drawMarker(ctx, a, "#8fd3ff");
    this._drawMarker(ctx, b, "#8fd3ff");
    this._drawMarker(ctx, c, "#8fd3ff");
    const start = Math.atan2(a.y - b.y, a.x - b.x);
    const end = Math.atan2(c.y - b.y, c.x - b.x);
    let delta = end - start;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    ctx.save();
    ctx.strokeStyle = "#8fd3ff";
    ctx.lineWidth = 1.4 * scale;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 22 * scale, start, start + delta, delta < 0);
    ctx.stroke();
    ctx.restore();
    const text = measurement.text || `${(measurement.value ?? 0).toFixed(1)}°`;
    this._drawValueTag(ctx, b.x + 26 * scale, b.y - 22 * scale, text, scale, "#bfe6ff");
  }

  _drawDihedral(ctx, a, b, c, d, measurement, scale) {
    this._dashedLine(ctx, a, b, "#ffb3d1", scale);
    this._dashedLine(ctx, b, c, "#ffb3d1", scale);
    this._dashedLine(ctx, c, d, "#ffb3d1", scale);
    for (const point of [a, b, c, d]) this._drawMarker(ctx, point, "#ffb3d1");
    const text = measurement.text || `${(measurement.value ?? 0).toFixed(1)}°`;
    this._drawValueTag(ctx, (b.x + c.x) / 2, (b.y + c.y) / 2 - 22 * scale, text, scale, "#ffd0e3");
  }

  _drawValueTag(ctx, centerX, centerY, text, scale, color) {
    const fontSize = 12 * scale;
    ctx.save();
    ctx.font = `600 ${fontSize}px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textBaseline = "middle";
    const paddingX = 5 * scale;
    const paddingY = 2 * scale;
    const width = ctx.measureText(text).width + paddingX * 2;
    const height = fontSize + paddingY * 2;
    const x = centerX - width / 2;
    const y = centerY - height / 2;
    ctx.fillStyle = "rgba(40, 30, 8, 0.88)";
    this._roundRect(ctx, x, y, width, height, 5 * scale);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 209, 102, 0.55)";
    ctx.lineWidth = 1 * scale;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(text, x + paddingX, y + height / 2 + 0.5);
    ctx.restore();
  }

  _roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  _updateCursor() {
    this.stage.classList.toggle("annotate", this.mode !== "browse");
  }
}
