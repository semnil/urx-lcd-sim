import { describe, expect, it } from "vitest";
import { fromJson, toJson } from "./value-json";

// A value written out and read back is the value, infinite numbers included.

describe("values as JSON text", () => {
  it("reads back what it wrote, an infinite number as the number", () => {
    const values = { up: Number.POSITIVE_INFINITY, down: Number.NEGATIVE_INFINITY, level: -12, name: "Infinity", on: true };
    expect(fromJson(toJson(values))).toEqual(values);
    expect(JSON.parse(toJson(values)), "the text itself holds no null in its place").not.toHaveProperty("up", null);
  });

  it("leaves an object that is not the marker as it is", () => {
    const values = { a: { infinite: 2 }, b: { infinite: 1, other: 0 } };
    expect(fromJson(toJson(values))).toEqual(values);
  });
});
