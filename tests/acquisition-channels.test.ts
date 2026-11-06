import {test,expect} from "bun:test";
import {classifyReferrer,isAIReferral} from "../src/lib/acquisition-channels";

test("AI/agent referrals require an identifiable assistant hostname",()=>{
 expect(classifyReferrer("chatgpt.com")).toBe("AI assistants");
 expect(classifyReferrer("www.perplexity.ai")).toBe("AI assistants");
 expect(classifyReferrer("https://gemini.google.com/app")).toBe("AI assistants");
 expect(classifyReferrer("claude.ai")).toBe("AI assistants");
 expect(isAIReferral("chatgpt.com.evil.example")).toBe(false);
});
test("Search, social, direct, and general referrals remain distinct",()=>{
 expect(classifyReferrer("www.google.co.ug")).toBe("Search engines");
 expect(classifyReferrer("bing.com")).toBe("Search engines");
 expect(classifyReferrer("m.facebook.com")).toBe("Social media");
 expect(classifyReferrer("youtube.com")).toBe("Social media");
 expect(classifyReferrer("")).toBe("Direct / unknown");
 expect(classifyReferrer("(direct / unknown)")).toBe("Direct / unknown");
 expect(classifyReferrer("example.org")).toBe("Other websites");
});
test("Do not treat Google as an AI visit without an AI referral host",()=>{
 expect(isAIReferral("google.com")).toBe(false);
 expect(isAIReferral("unknown-referrer")).toBe(false);
});
