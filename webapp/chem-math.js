/** Pure geometry/measurement helpers (usable from Node tests). */

export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function norm(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

export function angleDegrees(a, b, c) {
  const u = sub(a, b);
  const v = sub(c, b);
  const cos = dot(u, v) / Math.max(1e-9, norm(u) * norm(v));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

export function dihedralDegrees(a, b, c, d) {
  const b0 = sub(a, b);
  const b1 = sub(c, b);
  const b2 = sub(d, c);
  const axis = b1.map((value) => value / Math.max(1e-9, norm(b1)));
  const v = sub(b0, axis.map((value) => value * dot(b0, axis)));
  const w = sub(b2, axis.map((value) => value * dot(b2, axis)));
  return (Math.atan2(dot(cross(axis, v), w), dot(v, w)) * 180) / Math.PI;
}

export function buildMeasurement(mode, atoms) {
  const id = `m${Date.now()}${Math.floor(Math.random() * 1000)}`;
  if (mode === "measure") {
    const distance = Math.hypot(
      atoms[0].position[0] - atoms[1].position[0],
      atoms[0].position[1] - atoms[1].position[1],
      atoms[0].position[2] - atoms[1].position[2]
    );
    return { id, type: "distance", atoms, value: distance, text: `${distance.toFixed(2)} Å` };
  }
  if (mode === "angle") {
    const value = angleDegrees(atoms[0].position, atoms[1].position, atoms[2].position);
    return { id, type: "angle", atoms, value, text: `${value.toFixed(1)}°` };
  }
  if (mode === "dihedral") {
    const value = dihedralDegrees(
      atoms[0].position,
      atoms[1].position,
      atoms[2].position,
      atoms[3].position
    );
    return { id, type: "dihedral", atoms, value, text: `${value.toFixed(1)}°` };
  }
  return null;
}
