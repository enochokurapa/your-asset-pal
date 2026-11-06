import {test,expect} from "bun:test";
import { verificationMilestone, parseVerificationEmails } from "../src/lib/verification-reminders.server";
const due=new Date("2027-11-06T12:00:00.000Z");
const at=(date:string)=>new Date(date);
test("all pre-due milestones are distinct and chronological",()=>{
  expect(verificationMilestone(due,at("2027-04-01T12:00:00Z"))).toBeNull();
  expect(verificationMilestone(due,at("2027-05-06T12:00:00Z"))).toBe("six_months");
  expect(verificationMilestone(due,at("2027-08-06T12:00:00Z"))).toBe("three_months");
  expect(verificationMilestone(due,at("2027-10-23T12:00:00Z"))).toBe("two_weeks");
  expect(verificationMilestone(due,at("2027-10-30T12:00:00Z"))).toBe("one_week");
  expect(verificationMilestone(due,at("2027-11-05T12:00:00Z"))).toBe("one_day");
});
test("due and monthly reminders stop after six months",()=>{
  expect(verificationMilestone(due,due)).toBe("due");
  for(let n=1;n<=6;n++){
    const month=10+n; // November is month 10 in the UTC Date constructor
    const date=new Date(Date.UTC(2027+Math.floor(month/12),month%12,6,12));
    expect(verificationMilestone(due,date)).toBe(`overdue_${n}`);
  }
  expect(verificationMilestone(due,at("2028-06-06T12:00:00Z"))).toBeNull();
});
test("selected recipients are validated, normalized and deduplicated",()=>{
  expect(parseVerificationEmails([" Admin@Example.com ","admin@example.com","team@example.com"]))
    .toEqual(["admin@example.com","team@example.com"]);
  expect(()=>parseVerificationEmails(["person@example.com\nBcc:evil@example.com"])).toThrow();
  expect(()=>parseVerificationEmails(Array.from({length:11},(_,i)=>`user${i}@example.com`))).toThrow();
});
test("invalid due dates do not trigger reminders",()=>{
  expect(verificationMilestone(new Date("bad"),new Date())).toBeNull();
});
