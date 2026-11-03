import { describe, expect, it } from "vitest";
import { initialState, pincodeFrom, step, summarise, type AgentCtx, type Turn } from "../src/domain/agent";

const base: AgentCtx = { lang: "en", firstName: "Asha", orderName: "#1042", items: "a blue kurta", amount: 1299, paymentMode: "COD", address: "12 MG Road, Pune", addressAmbiguous: false, pincode: "411001" };

function run(lines: string[], ctx: AgentCtx = base) {
  let state = initialState();
  const turns: Turn[] = [{ who: "agent", text: "hi" }];
  const replies: string[] = [];
  for (const l of lines) {
    const r = step(state, l, ctx);
    turns.push({ who: "customer", text: l }, { who: "agent", text: r.reply });
    replies.push(r.reply);
    state = r.state;
    if (r.done) break;
  }
  return { state, replies, result: summarise(state, turns) };
}

describe("pincodeFrom", () => {
  it("reads digits and spoken digits", () => {
    expect(pincodeFrom("it is 411001")).toBe("411001");
    expect(pincodeFrom("four one one zero zero one")).toBe("411001");
    expect(pincodeFrom("pin ४११००१")).toBe("411001");
    expect(pincodeFrom("hello")).toBeNull();
    expect(pincodeFrom("012345")).toBeNull();
  });
});

describe("order confirmation call", () => {
  it("confirms order and a good address", () => {
    const { result } = run(["yes that is right", "yes it is correct"]);
    expect(result.outcome).toBe("CONFIRMED");
  });
  it("asks for the address straight away when it is ambiguous", () => {
    const { replies, result } = run(["yes", "Flat 4B, Green Heights, near City Mall, Baner Pune 411045", "yes"], { ...base, addressAmbiguous: true });
    expect(replies[0]).toMatch(/could not clearly verify/);
    expect(result.outcome).toBe("ADDRESS_CORRECTED");
    expect(result.extracted.pincode).toBe("411045");
    expect(result.extracted.address1).toContain("Green Heights");
  });
  it("collects the pincode separately when not said", () => {
    const { result } = run(["yes", "no it is wrong", "Flat 4B Green Heights near City Mall Baner", "four one one zero four five", "yes right"]);
    expect(result.outcome).toBe("ADDRESS_CORRECTED");
    expect(result.extracted.pincode).toBe("411045");
  });
  it("re-asks once if the read-back is wrong, then hands off", () => {
    const { result } = run(["yes", "no", "Flat 4B Green Heights near City Mall 411045", "no", "Flat 9 Lake View near Phoenix Mall 411014", "no"]);
    expect(result.outcome).toBe("UNCLEAR");
  });
  it("handles cancel and changing their mind", () => {
    expect(run(["I want to cancel", "yes"]).result.outcome).toBe("CANCEL_ORDER");
    expect(run(["cancel it", "no", "yes", "yes"]).result.outcome).toBe("CONFIRMED");
  });
  it("flags a wrong order", () => {
    const { result } = run(["no I did not order that"]);
    expect(result.outcome).toBe("UNCLEAR");
    expect(result.extracted.statedReason).toMatch(/not correct/);
  });
  it("treats 'no, the address is wrong' at the first question as an address issue", () => {
    const { replies } = run(["no the address is wrong"]);
    expect(replies[0]).toMatch(/full address/);
  });
  it("gives up after three misses", () => {
    expect(run(["mumble", "blah", "uh"]).result.outcome).toBe("UNCLEAR");
  });
  it("no speech means no answer", () => {
    expect(summarise(initialState(), [{ who: "agent", text: "hi" }]).outcome).toBe("NOT_ANSWERED");
  });
  it("works in Hindi", () => {
    const hi = { ...base, lang: "hi" as const };
    expect(run(["हाँ सही है", "हाँ पता सही है"], hi).result.outcome).toBe("CONFIRMED");
    const { result } = run(["haan", "nahi galat hai", "फ्लैट 4 बी ग्रीन हाइट्स सिटी मॉल के पास बाणेर 411045", "haan sahi"], hi);
    expect(result.outcome).toBe("ADDRESS_CORRECTED");
  });
});
