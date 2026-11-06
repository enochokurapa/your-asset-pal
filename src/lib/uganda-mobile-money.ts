import { z } from "zod";

/**
 * Uganda mobile-money checkout uses local 07/03 numbers or international +256.
 * Keep phone formatting in one place for browser and all payment handlers.
 * Do not infer the payment currency from the number: Yo Uganda collects UGX.
 */
export function normalizeUgandanMobileMoneyPhone(input: string): string | null {
  const raw = input.trim().replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(raw)) return null;
  const digits = raw.startsWith("+") ? raw.slice(1) : raw;
  const international = digits.startsWith("256")
    ? digits
    : digits.startsWith("0")
      ? "256" + digits.slice(1)
      : "256" + digits;
  if (!/^256(?:7|3)\d{8}$/.test(international)) return null;
  return international;
}

export const ugandanMobileMoneyPhoneSchema = z.string().trim().max(24)
  .superRefine((value, context) => {
    if (!normalizeUgandanMobileMoneyPhone(value)) {
      context.addIssue({
        code: "custom",
        message: "Enter a complete Ugandan mobile-money number, for example 0772 123 456 or +256 772 123 456.",
      });
    }
  })
  .transform(value => normalizeUgandanMobileMoneyPhone(value)!);
