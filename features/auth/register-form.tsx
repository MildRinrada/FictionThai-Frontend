"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, fieldInputProps } from "@/components/ui/field";
import { formErrors, register } from "@/lib/auth-client";

/**
 * Registration form.
 *
 * Collects only what docs/11 §4.1 permits: username, email, password. No real
 * name, address, phone number, gender, or date of birth - data minimisation is
 * a product principle, not an oversight.
 */
export function RegisterForm({ redirectTo = "/" }: { redirectTo?: string }) {
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
      await register({
        username: String(form.get("username") ?? ""),
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      });

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

      <Field
        id="username"
        label="ชื่อผู้ใช้"
        errors={fields.username}
        hint="ใช้ตัวอักษรภาษาอังกฤษ ตัวเลข ขีดกลาง และขีดล่าง 3–32 ตัวอักษร"
        required
      >
        <input
          {...fieldInputProps("username", fields.username, "hint")}
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </Field>

      <Field
        id="email"
        label="อีเมล"
        errors={fields.email}
        hint="ใช้สำหรับกู้คืนรหัสผ่าน จะไม่แสดงต่อผู้อ่าน"
        required
      >
        <input
          {...fieldInputProps("email", fields.email, "hint")}
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </Field>

      <Field
        id="password"
        label="รหัสผ่าน"
        errors={fields.password}
        // docs/10 §9: prefer long and unique over forced character classes.
        hint="อย่างน้อย 12 ตัวอักษร แนะนำให้ใช้วลีที่ยาวและจำง่าย"
        required
      >
        <input
          {...fieldInputProps("password", fields.password, "hint")}
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        {pending ? "กำลังสร้างบัญชี…" : "สร้างบัญชี"}
      </Button>

      <p className="text-xs text-text-muted">
        คุณสามารถอ่านนิยายได้ทันทีโดยไม่ต้องยืนยันอีเมล
        การยืนยันจำเป็นเมื่อคุณต้องการเผยแพร่ผลงาน
      </p>
    </form>
  );
}
