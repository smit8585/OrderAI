import { ConnectionForm } from "@/components/client";
import { connectionRows, liveStatus } from "@/services/connections";

export const metadata = { title: "Connections" };

export default async function ConnectionsPage() {
  const [rows, live] = await Promise.all([connectionRows(), liveStatus()]);
  const sr = rows.get("SHIPROCKET");
  const vc = rows.get("VOICE");
  return (
    <>
      <div className="page-head"><div><h1>Connections</h1><p className="sub">Credentials are encrypted before they are saved.</p></div></div>
      <div style={{ display: "grid", gap: 24, maxWidth: 640 }}>
        <ConnectionForm
          provider="shiprocket"
          title="Shiprocket"
          blurb="Use an API user, not your normal login: in the Shiprocket panel go to Settings, then API, then Add new API user. Use a different email from your main account."
          fields={[{ name: "email", label: "API user email" }, { name: "password", label: "API user password", type: "password" }]}
          connected={live.shiprocket}
          label={sr?.accountLabel}
          error={sr?.lastError}
        />
        <ConnectionForm
          provider="voice"
          title="Voice agent (Inferex)"
          blurb="The sponsor's voice agent. Saved now; the live call uses it once the browser link is switched on."
          fields={[
            { name: "baseUrl", label: "API base URL", hint: "https://api.inferexai.in" },
            { name: "apiKey", label: "API key", type: "password", hint: "Needs the audio scope." },
            { name: "agentId", label: "Agent ID", optional: true, hint: "Starts with va_. Leave empty and OrderAI will create the agent." },
          ]}
          connected={live.voice}
          label={vc?.accountLabel}
          error={vc?.lastError}
        />
      </div>
    </>
  );
}
