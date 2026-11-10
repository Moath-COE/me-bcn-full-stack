"use client";

import { useState } from "react";
import { ErrorText, FieldLabel, TextField } from "@/components/ui/kit";

export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  autoComplete = "new-password",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  autoComplete?: "new-password" | "current-password";
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <TextField
        id={id}
        name="password"
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        invalid={!!error}
        aria-describedby={
          [hint && `${id}-hint`, error && `${id}-error`]
            .filter(Boolean)
            .join(" ") || undefined
        }
        required
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        {hint ? (
          <p id={`${id}-hint`} className="text-sm leading-base text-ink-2">
            {hint}
          </p>
        ) : null}
        <button
          type="button"
          aria-controls={id}
          aria-pressed={visible}
          className="inline-flex min-h-11 min-w-11 items-center text-sm leading-base font-semibold text-ink-2 underline underline-offset-4"
          onClick={() => setVisible(!visible)}
        >
          {visible ? "Hide password" : "Show password"}
        </button>
      </div>
      {error ? <ErrorText id={`${id}-error`}>{error}</ErrorText> : null}
    </div>
  );
}
