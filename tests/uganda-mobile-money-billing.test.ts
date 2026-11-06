import { test, expect } from "bun:test";
import { normalizeUgandanMobileMoneyPhone, ugandanMobileMoneyPhoneSchema } from "../src/lib/uganda-mobile-money";
import { usdToUgx } from "../src/lib/pricing-fx.server";

test("Uganda mobile-money numbers normalize from local or international formats", () => {
  const numbers=["0772 123 456","+256 772 123 456","256772123456","772123456","(0772) 123-456"];
  for(const input of numbers){
    expect(normalizeUgandanMobileMoneyPhone(input)).toBe("256772123456");
    expect(ugandanMobileMoneyPhoneSchema.parse(input)).toBe("256772123456");
  }
  expect(normalizeUgandanMobileMoneyPhone("0312123456")).toBe("256312123456");
});

test("incomplete country code and unsafe phone input cannot create payment requests", () => {
  for(const invalid of ["","256","+256","07","077212345","07721234567","abc0772123456","+15551234567","0772 123 456 ext 3"]){
    expect(normalizeUgandanMobileMoneyPhone(invalid)).toBeNull();
    expect(ugandanMobileMoneyPhoneSchema.safeParse(invalid).success).toBe(false);
  }
});

test("mobile-money checkout is charged in UGX using an approved USD reference rate", () => {
  expect(usdToUgx(128,3600)).toBe(460800);
  expect(usdToUgx(10,3600)).toBe(36000);
  expect(()=>usdToUgx(128,0)).toThrow();
  expect(()=>usdToUgx(-1,3600)).toThrow();
});
