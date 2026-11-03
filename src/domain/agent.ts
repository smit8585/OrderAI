import type { CallOutcome } from "@prisma/client";

/**
 * The order-confirmation call script. Pure functions, so every branch is unit tested and the demo never depends on the network.
 * Flow: confirm the order -> confirm or collect the delivery address -> finish.
 */

export type Lang = "en" | "hi";

export type AgentCtx = {
  lang: Lang;
  firstName: string;
  orderName: string;
  items: string;
  amount: number;
  paymentMode: "COD" | "PREPAID";
  /** The address as we hold it, spoken back to the customer. */
  address: string;
  addressAmbiguous: boolean;
  pincode: string;
};

export type Turn = { who: "agent" | "customer"; text: string };

export type Phase = "CONFIRM_ORDER" | "CONFIRM_ADDRESS" | "ASK_ADDRESS" | "ASK_PINCODE" | "CONFIRM_NEW_ADDRESS" | "CONFIRM_CANCEL" | "END";

export type ScriptState = {
  phase: Phase;
  orderOk?: boolean;
  addressOk?: boolean;
  newAddress?: string;
  newPincode?: string;
  cancel?: boolean;
  orderDispute?: boolean;
  unsure: number;
  tries: number;
};

export const initialState = (): ScriptState => ({ phase: "CONFIRM_ORDER", unsure: 0, tries: 0 });

// ---------- understanding the customer ----------

export function intents(text: string) {
  const t = text.toLowerCase();
  const has = (re: RegExp) => re.test(t) || re.test(text);
  return {
    yes: has(/\b(yes|yeah|yep|yup|sure|ok|okay|correct|right|fine|haan|han|ji|theek|thik|sahi|bilkul)\b|हाँ|हां|जी|ठीक|सही|बिल्कुल/),
    no: has(/\b(no|nope|nahi|nahin|not|wrong|galat|incorrect)\b|नहीं|नही|गलत/),
    cancel: has(/cancel|don'?t want|do not want|not interested|nahi chahiye|mat bhejo|no longer (need|want)|कैंसिल|रद्द|नहीं चाहिए/),
    changeAddress: has(/\b(change|different|moved|shifted|incomplete|missing)\b|new (address|flat|house|place)|address.{0,20}(wrong|incorrect|incomplete|not (correct|right|complete))|wrong address|pata.{0,12}(galat|nahi)|galat pata|पता.{0,12}(गलत|नहीं)|गलत पता|बदल|नया पता/),
  };
}

const SPOKEN: Record<string, string> = { zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ek: "1", do: "2", teen: "3", char: "4", chaar: "4", paanch: "5", panch: "5", chhe: "6", chhah: "6", saat: "7", aath: "8", nau: "9", shunya: "0" };
const DEVANAGARI = "०१२३४५६७८९";

/** A 6-digit pincode from speech: "four one one zero zero one" or "411001". */
export function pincodeFrom(text: string): string | null {
  const tokens = text
    .toLowerCase()
    .replace(/[०-९]/g, (c) => String(DEVANAGARI.indexOf(c)))
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SPOKEN[w] ?? w);
  // Spoken digits arrive one at a time ("4 1 1 0 0 1"); join runs of single digits, keep other words apart.
  const parts: string[] = [];
  let run = "";
  for (const t of tokens) {
    if (/^\d$/.test(t)) run += t;
    else {
      if (run) parts.push(run);
      run = "";
      parts.push(t);
    }
  }
  if (run) parts.push(run);
  const m = parts.find((p) => /^[1-9]\d{5}$/.test(p));
  return m ?? null;
}

// ---------- what the agent says ----------

const M = {
  en: {
    open: (c: AgentCtx) =>
      `Hello ${c.firstName}, this is the order assistant calling about your recent order ${c.orderName}. You ordered ${c.items}, for ${Math.round(c.amount)} rupees, ${c.paymentMode === "COD" ? "to be paid in cash on delivery" : "already paid online"}. Is that correct?`,
    addrKnown: (c: AgentCtx) => `Thank you. We will deliver to ${c.address}. Is this address complete and correct?`,
    addrAsk: "Thank you. We could not clearly verify your delivery address. Could you tell me the full address, with house or flat number, area and a landmark?",
    addrAskAgain: "Please say the full address again, with house number, area and a landmark.",
    addrShort: "That was a bit short. Could you say the full address, with house or flat number, area and a landmark?",
    pincodeAsk: "And what is the six digit pincode?",
    pincodeBad: "Sorry, I did not get a six digit pincode. Please say it digit by digit.",
    readBack: (a: string, p: string) => `Let me confirm. I have ${a}, pincode ${p.split("").join(" ")}. Is that right?`,
    done: (cod: boolean) => `Thank you, your order is confirmed.${cod ? " Please keep the cash ready at delivery." : ""} Goodbye.`,
    doneNew: (cod: boolean) => `Thank you, I have noted your new address and your order is confirmed.${cod ? " Please keep the cash ready at delivery." : ""} Goodbye.`,
    cancelAsk: "I understand. Do you want to cancel this order?",
    cancelDone: "Okay, I have noted that you want to cancel. Our team will contact you. Goodbye.",
    orderWrong: "Sorry about that. I have noted the problem and our team will call you to fix it. Goodbye.",
    keepOrder: "Alright, we will keep the order.",
    sorryYesNo: "Sorry, please say yes or no.",
    sorry: "Sorry, I did not catch that. Could you say it again?",
    giveUp: "I am having trouble hearing you. A colleague will call you back. Goodbye.",
  },
  hi: {
    open: (c: AgentCtx) =>
      `नमस्ते ${c.firstName} जी, मैं ऑर्डर असिस्टेंट बोल रहा हूँ। आपके ऑर्डर ${c.orderName} के बारे में कॉल कर रहा हूँ। आपने ${c.items} मँगवाया है, ${Math.round(c.amount)} रुपये का, ${c.paymentMode === "COD" ? "जिसका भुगतान डिलीवरी पर नकद होगा" : "जिसका भुगतान हो चुका है"}। क्या यह सही है?`,
    addrKnown: (c: AgentCtx) => `धन्यवाद। हम आपका ऑर्डर इस पते पर भेजेंगे: ${c.address}। क्या यह पता पूरा और सही है?`,
    addrAsk: "धन्यवाद। हम आपका डिलीवरी पता ठीक से सत्यापित नहीं कर पाए। कृपया अपना पूरा पता बताइए, मकान या फ्लैट नंबर, इलाका और कोई लैंडमार्क के साथ।",
    addrAskAgain: "कृपया पूरा पता फिर से बताइए, मकान नंबर, इलाका और लैंडमार्क के साथ।",
    addrShort: "पता थोड़ा छोटा है। कृपया मकान या फ्लैट नंबर, इलाका और लैंडमार्क के साथ पूरा पता बताइए।",
    pincodeAsk: "और छह अंकों का पिन कोड क्या है?",
    pincodeBad: "माफ़ कीजिए, मुझे छह अंकों का पिन कोड नहीं मिला। कृपया एक-एक अंक बोलिए।",
    readBack: (a: string, p: string) => `मैं दोबारा पक्का कर लूँ। पता है ${a}, पिन कोड ${p.split("").join(" ")}। क्या यह सही है?`,
    done: (cod: boolean) => `धन्यवाद, आपका ऑर्डर कन्फर्म हो गया है।${cod ? " डिलीवरी पर कृपया नकद तैयार रखिए।" : ""} नमस्ते।`,
    doneNew: (cod: boolean) => `धन्यवाद, मैंने आपका नया पता नोट कर लिया है और ऑर्डर कन्फर्म हो गया है।${cod ? " डिलीवरी पर कृपया नकद तैयार रखिए।" : ""} नमस्ते।`,
    cancelAsk: "समझ गया। क्या आप यह ऑर्डर कैंसिल करना चाहते हैं?",
    cancelDone: "ठीक है, मैंने नोट कर लिया कि आप ऑर्डर कैंसिल करना चाहते हैं। हमारी टीम आपसे संपर्क करेगी। नमस्ते।",
    orderWrong: "माफ़ कीजिए। मैंने समस्या नोट कर ली है, हमारी टीम आपको कॉल करके ठीक करेगी। नमस्ते।",
    keepOrder: "ठीक है, हम ऑर्डर को जारी रखेंगे।",
    sorryYesNo: "माफ़ कीजिए, कृपया हाँ या नहीं बोलिए।",
    sorry: "माफ़ कीजिए, मैं समझ नहीं पाया। कृपया दोबारा बोलिए।",
    giveUp: "मुझे आपकी आवाज़ साफ़ नहीं आ रही। हमारा एक साथी आपको वापस कॉल करेगा। नमस्ते।",
  },
} as const;

export const opening = (c: AgentCtx) => M[c.lang].open(c);

type Step = { reply: string; state: ScriptState; done?: boolean };

const end = (s: ScriptState, reply: string): Step => ({ reply, state: { ...s, phase: "END" }, done: true });

function askAddress(c: AgentCtx, s: ScriptState, text: string): Step {
  return { reply: text, state: { ...s, phase: "ASK_ADDRESS" } };
}

function afterOrder(c: AgentCtx, s: ScriptState): Step {
  s = { ...s, orderOk: true };
  return c.addressAmbiguous
    ? askAddress(c, s, M[c.lang].addrAsk)
    : { reply: M[c.lang].addrKnown(c), state: { ...s, phase: "CONFIRM_ADDRESS" } };
}

function giveAddress(c: AgentCtx, s: ScriptState, text: string): Step {
  const pin = pincodeFrom(text);
  const body = text.replace(/\b[1-9]\d{5}\b/, "").trim();
  const addr = body.split(/\s+/).length >= 3 ? body : s.newAddress;
  if (!addr || addr.split(/\s+/).length < 3) return { reply: M[c.lang].addrShort, state: { ...s, phase: "ASK_ADDRESS" } };
  const next = { ...s, newAddress: addr, newPincode: pin ?? s.newPincode };
  if (!next.newPincode) return { reply: M[c.lang].pincodeAsk, state: { ...next, phase: "ASK_PINCODE" } };
  return { reply: M[c.lang].readBack(addr, next.newPincode), state: { ...next, phase: "CONFIRM_NEW_ADDRESS" } };
}

/** One customer turn in, one agent turn out. */
export function step(state: ScriptState, text: string, c: AgentCtx): Step {
  const m = M[c.lang];
  const i = intents(text);
  const s = { ...state };
  if (s.phase === "END") return { reply: "", state: s, done: true };

  if (s.phase !== "CONFIRM_CANCEL" && i.cancel) return { reply: m.cancelAsk, state: { ...s, phase: "CONFIRM_CANCEL" } };

  switch (s.phase) {
    case "CONFIRM_CANCEL":
      if (i.yes && !i.no) return end({ ...s, cancel: true }, m.cancelDone);
      if (i.no) {
        const back = { ...s, cancel: false };
        if (!s.orderOk) return { reply: `${m.keepOrder} ${m.open(c)}`, state: { ...back, phase: "CONFIRM_ORDER" } };
        return c.addressAmbiguous
          ? askAddress(c, back, `${m.keepOrder} ${m.addrAsk}`)
          : { reply: `${m.keepOrder} ${m.addrKnown(c)}`, state: { ...back, phase: "CONFIRM_ADDRESS" } };
      }
      return { reply: m.sorryYesNo, state: s };

    case "CONFIRM_ORDER":
      if (i.yes && !i.no) return afterOrder(c, s);
      if (i.changeAddress && !i.yes) return askAddress(c, { ...s, orderOk: true }, m.addrAsk);
      if (i.no) return end({ ...s, orderDispute: true }, m.orderWrong);
      break;

    case "CONFIRM_ADDRESS":
      if (i.yes && !i.no && !i.changeAddress) return end({ ...s, orderOk: true, addressOk: true }, m.done(c.paymentMode === "COD"));
      if (i.no || i.changeAddress) return askAddress(c, s, m.addrAsk);
      break;

    case "ASK_ADDRESS":
      return giveAddress(c, s, text);

    case "ASK_PINCODE": {
      const pin = pincodeFrom(text);
      if (!pin) return { reply: m.pincodeBad, state: s };
      return { reply: m.readBack(s.newAddress ?? "", pin), state: { ...s, newPincode: pin, phase: "CONFIRM_NEW_ADDRESS" } };
    }

    case "CONFIRM_NEW_ADDRESS":
      if (i.yes && !i.no) return end(s, m.doneNew(c.paymentMode === "COD"));
      if (i.no) {
        const tries = s.tries + 1;
        if (tries >= 2) return end({ ...s, tries, newAddress: undefined }, m.giveUp);
        return { reply: m.addrAskAgain, state: { ...s, tries, newAddress: undefined, newPincode: undefined, phase: "ASK_ADDRESS" } };
      }
      break;
  }

  const unsure = s.unsure + 1;
  if (unsure >= 3) return end({ ...s, unsure }, m.giveUp);
  return { reply: m.sorry, state: { ...s, unsure } };
}

// ---------- the result ----------

export type CallSummary = {
  outcome: CallOutcome;
  extracted: { address1?: string; pincode?: string; statedReason?: string };
  summary: string;
};

export function summarise(s: ScriptState, turns: Turn[]): CallSummary {
  if (!turns.some((t) => t.who === "customer")) return { outcome: "NOT_ANSWERED", extracted: {}, summary: "The customer did not say anything." };
  if (s.phase === "END" && s.cancel) return { outcome: "CANCEL_ORDER", extracted: { statedReason: "Customer wants to cancel" }, summary: "Customer wants to cancel the order. A person needs to follow up." };
  if (s.phase === "END" && s.orderDispute) return { outcome: "UNCLEAR", extracted: { statedReason: "Order details not correct" }, summary: "Customer says the order details are not correct. A person needs to call back." };
  if (s.phase === "END" && s.newAddress && s.newPincode) {
    return { outcome: "ADDRESS_CORRECTED", extracted: { address1: s.newAddress, pincode: s.newPincode }, summary: `Customer confirmed the order and gave a new address: ${s.newAddress}, pincode ${s.newPincode}.` };
  }
  if (s.phase === "END" && s.orderOk && s.addressOk) return { outcome: "CONFIRMED", extracted: {}, summary: "Customer confirmed the order and the delivery address." };
  return { outcome: "UNCLEAR", extracted: {}, summary: "The call ended before the order and address were confirmed. Review the conversation." };
}
