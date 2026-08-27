import { describe, it, expect } from "vitest";
import { arrayToCSV } from "@/lib/export";

describe("arrayToCSV", () => {
  const columns = [
    { key: "name" as const, header: "Name" },
    { key: "age" as const, header: "Age" },
  ];

  it("converts basic data to CSV", () => {
    const rows = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ];

    const csv = arrayToCSV(rows, columns);
    const lines = csv.split("\n");

    expect(lines[0]).toBe('"Name","Age"');
    expect(lines[1]).toBe('"Alice","30"');
    expect(lines[2]).toBe('"Bob","25"');
  });

  it("escapes double quotes in values", () => {
    const rows = [{ name: 'Say "hello"', age: 20 }];
    const csv = arrayToCSV(rows, columns);

    expect(csv).toContain('"Say ""hello"""');
  });

  it("handles null and undefined values as empty strings", () => {
    const rows = [
      { name: "Alice", age: null },
      { name: undefined, age: 25 },
    ];
    const csv = arrayToCSV(rows, columns);
    const lines = csv.split("\n");

    expect(lines[1]).toBe('"Alice",""');
    expect(lines[2]).toBe('"","25"');
  });

  it("returns only the header row for an empty array", () => {
    const csv = arrayToCSV([], columns);

    expect(csv).toBe('"Name","Age"');
  });

  it("handles a single row", () => {
    const rows = [{ name: "Alice", age: 30 }];
    const csv = arrayToCSV(rows, columns);
    const lines = csv.split("\n");

    expect(lines).toHaveLength(2);
  });
});
