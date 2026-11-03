import { describe, expect, it } from "vitest";
import { addressStatusFor, assessAddress, readPlatformFlag } from "../src/domain/address";

const good = { address1: "Flat 4B, Green Heights, near City Mall, Baner", city: "Pune", state: "Maharashtra", pincode: "411045" };

describe("assessAddress", () => {
  it("accepts a complete address", () => expect(assessAddress(good).status).toBe("VALID"));
  it("flags short, numberless, pincode-less addresses", () => {
    const r = assessAddress({ address1: "Main road", city: "Pune", state: "MH", pincode: "41104" });
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

describe("readPlatformFlag", () => {
  it("reads several spellings", () => {
    expect(readPlatformFlag({ is_address_ambiguous: true })?.status).toBe("AMBIGUOUS");
    expect(readPlatformFlag({ is_address_ambiguous: "false" })?.status).toBe("VALID");
    expect(readPlatformFlag({ address_validity: "Invalid" })?.status).toBe("AMBIGUOUS");
    expect(readPlatformFlag({ address_verified: true })?.status).toBe("VALID");
    expect(readPlatformFlag({ address_verified: false })?.status).toBe("AMBIGUOUS");
    expect(readPlatformFlag({ nothing: 1 })).toBeNull();
  });
  it("the platform flag beats our own check", () => {
    expect(addressStatusFor(good, { is_address_ambiguous: 1 })).toMatchObject({ status: "AMBIGUOUS", source: "shiprocket" });
    expect(addressStatusFor(good, {})).toMatchObject({ status: "VALID", source: "check" });
  });
});
