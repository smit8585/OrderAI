import { voiceCreds } from "@/services/connections";

/**
 * Phone calls through the sponsor's voice agent.
 *
 * Not wired yet: this waits for the sponsor's API documentation. The rest of the app (the Start call button,
 * the call script, the result handling) is built against this one function, so connecting the real API is a change to this file only.
 */
export type PhoneCallRequest = {
  callId: string;
  to: string; // +91XXXXXXXXXX
  language: "en" | "hi";
  variables: Record<string, string | number | boolean>;
};

export async function placePhoneCall(_req: PhoneCallRequest): Promise<{ providerCallId: string }> {
  const c = await voiceCreds();
  if (!c) throw new Error("The voice agent is not connected. Add it on the Connections page.");
  throw new Error("The voice agent connection is saved, but the call step is waiting for the sponsor's API documentation.");
}
