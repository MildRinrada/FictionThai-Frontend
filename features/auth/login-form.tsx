"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, fieldInputProps } from "@/components/ui/field";
import { formErrors, login } from "@/lib/auth-client";

/**
 * Sign-in form.
 *
 * A Client Component because it needs local state and a submit handler; it is
 * deliberately small so the reader path stays free of this JavaScript
 * (docs/07 §20).
 *
 * All validation shown here comes FROM the API. The form does not re-implement
 * a single rule - that would let the two drift apart, and the server is the
 * only place a rule actually holds (docs/11 §43).
 */
export function LoginForm({ redirectTo = "/" }: { redirectTo?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setFields({});

    const form = new FormData(event.currentTarget);

    try {
      await login({
        identifier: String(form.get("identifier") ?? ""),
        password: String(form.get("password") ?? ""),
      });

      // refresh() re-runs the Server Components so the new session is picked up
      // server-side; without it the page would still render the guest view.
      router.replace(redirectTo);
      router.refresh();
    } catch (error) {
      const parsed = formErrors(error);
      setMessage(parsed.message);
      setFields(parsed.fields);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {message ? (
        <p role="alert" className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
          {message}
        </p>
      ) : null}

      <Field id="identifier" label="ชื่อผู้ใช้หรืออีเมล" errors={fields.identifier} required>
        <input
          {...fieldInputProps("identifier", fields.identifier)}
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </Field>

      <Field id="password" label="รหัสผ่าน" errors={fields.password} required>
        <input
          {...fieldInputProps("password", fields.password)}
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </Button>
    </form>
  );
}
