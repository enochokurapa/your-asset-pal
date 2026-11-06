export type AcquisitionChannel="AI assistants"|"Search engines"|"Social media"|"Direct / unknown"|"Other websites";
const ai=["chatgpt.com","chat.openai.com","perplexity.ai","claude.ai","gemini.google.com",
  "copilot.microsoft.com","you.com","poe.com","meta.ai","phind.com"];
const search=["google.com","google.co.ug","google.co.uk","bing.com","duckduckgo.com",
  "yahoo.com","yandex.com","ecosia.org","brave.com","search.brave.com"];
const social=["facebook.com","m.facebook.com","instagram.com","linkedin.com",
  "x.com","twitter.com","tiktok.com","youtube.com","reddit.com","pinterest.com","threads.net"];
function matches(host:string,list:string[]):boolean{
 return list.some(domain=>host===domain||host.endsWith("."+domain));
}
/** Classifies only source hostnames supplied by actual analytics providers.
 * The classifier does not infer AI referrals from bots, search keywords or unattributed traffic.
 */
export function classifyReferrer(input:string):AcquisitionChannel{
 let host=input.toLowerCase().trim().replace(/^www\./,"");
 if(!host||host==="(direct / unknown)"||host==="(none)"||host==="direct")return "Direct / unknown";
 try{if(host.includes("://"))host=new URL(host).hostname.toLowerCase().replace(/^www\./,"")}catch{return "Other websites"}
 if(matches(host,ai))return "AI assistants";
 if(matches(host,search)||/^(?:www\.)?google\.[a-z.]{2,}$/.test(host))return "Search engines";
 if(matches(host,social))return "Social media";
 return "Other websites";
}
export function isAIReferral(host:string){return classifyReferrer(host)==="AI assistants"}
