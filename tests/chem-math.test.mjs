import test from "node:test";
import assert from "node:assert/strict";
import {
  angleDegrees,
  buildMeasurement,
  dihedralDegrees,
} from "../webapp/chem-math.js";

test("angle 90 degrees", () => {
  assert.ok(Math.abs(angleDegrees([1, 0, 0], [0, 0, 0], [0, 1, 0]) - 90) < 1e-6);
});

test("angle 180 degrees", () => {
  assert.ok(Math.abs(angleDegrees([1, 0, 0], [0, 0, 0], [-1, 0, 0]) - 180) < 1e-6);
});

test("dihedral planar is 0 or 180", () => {
  const value = dihedralDegrees([1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]);
  assert.ok(Math.abs(value) < 1e-6 || Math.abs(Math.abs(value) - 180) < 1e-6);
});

test("dihedral 60 degrees", () => {
  const value = dihedralDegrees(
    [1, 0, 0],
    [0, 0, 0],
    [0, 0, 1],
    [Math.cos(Math.PI / 3), Math.sin(Math.PI / 3), 1]
  );
  assert.ok(Math.abs(value - 60) < 1e-6);
});

test("angle 120 degrees", () => {
  assert.ok(Math.abs(angleDegrees([1, 0, 0], [0, 0, 0], [-0.5, Math.sqrt(3) / 2, 0]) - 120) < 1e-6);
});

test("distance measurement", () => {
  const measurement = buildMeasurement("measure", [
    { key: "a0", text: "C1", position: [0, 0, 0] },
    { key: "a1", text: "O1", position: [3, 4, 0] },
  ]);
  assert.equal(measurement.type, "distance");
  assert.equal(measurement.value, 5);
  assert.equal(measurement.text, "5.00 Å");
});

test("angle measurement tag", () => {
  const measurement = buildMeasurement("angle", [
    { key: "a0", text: "A", position: [1, 0, 0] },
    { key: "a1", text: "B", position: [0, 0, 0] },
    { key: "a2", text: "C", position: [0, 1, 0] },
  ]);
  assert.equal(measurement.type, "angle");
  assert.ok(measurement.text.endsWith("°"));
});
