import { SettingsForm } from "@/components/client";
import { getSettings } from "@/lib/db";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <>
      <div className="page-head"><div><h1>Settings</h1></div></div>
      <div style={{ maxWidth: 560 }}><SettingsForm language={s.language} autoUpdate={s.autoUpdate} /></div>
    </>
  );
}
