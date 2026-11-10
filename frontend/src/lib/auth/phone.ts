/* The backend accepts Saudi mobile numbers only and stores them as `+9665XXXXXXXX`. */
export function toE164Saudi(input: string): string | null {
  const number = input.replace(/[\s-]/g, "");
  const match = /^(?:0|\+966|00966)?(5\d{8})$/.exec(number);
  return match ? `+966${match[1]}` : null;
}

export function toLocalSaudi(e164: string): string {
  return e164.replace(/^\+966(?=5\d{8}$)/, "0");
}
