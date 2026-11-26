/** Shared password requirements for sign-up, reset and administration. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (!/[a-z]/.test(password)) return "Include a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Include an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Include a number.";
  if (!/[^A-Za-z0-9\s]/.test(password)) return "Include a special symbol.";
  for (let index = 0; index <= password.length - 4; index++) {
    const digits = password.slice(index, index + 4);
    if (!/^\d{4}$/.test(digits)) continue;
    const values = [...digits].map(Number);
    if (values.every((value, i) => i === 0 || value === values[i - 1] + 1) ||
        values.every((value, i) => i === 0 || value === values[i - 1] - 1)) {
      return "Avoid four ascending or descending consecutive numbers.";
    }
  }
  return null;
}
export const PASSWORD_RULE_HINT =
  "At least 8 characters: uppercase, lowercase, number and symbol; no 4 ascending or descending digits.";
