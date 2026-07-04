import { describe, expect, it } from "vitest";
import { status } from "./index.js";

describe("baseline status", () => {
  it("reports the Sovereign OS as online", () => {
    expect(status).toBe("Sovereign OS Online");
  });
});
