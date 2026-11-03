import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "@/components/client";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return (
    <main className="login">
      <div className="login-box">
        <span className="mark">Order<span>.</span>AI</span>
        <h1>Enter your PIN</h1>
        <p className="sub" style={{ marginBottom: 24 }}>Confirm orders and fix unclear addresses by voice.</p>
        <LoginForm />
      </div>
    </main>
  );
}
