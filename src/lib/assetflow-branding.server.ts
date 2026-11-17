import {readFileSync} from "node:fs";
import {join} from "node:path";

/** Reuse the approved AssetFlow360 logo, not a substitute wordmark. */
export function approvedAssetFlowLogoPng():Buffer {
  const root=process.cwd();
  const candidates=[
    join(root,".output","public","assetflow360-logo.svg"),
    join(root,"public","assetflow360-logo.svg"),
  ];
  for(const file of candidates){
    try{
      const svg=readFileSync(file,"utf8");
      const png=svg.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
      if(png)return Buffer.from(png[1],"base64");
    }catch{/* use next candidate */}
  }
  throw new Error("Approved AssetFlow360 logo not available in release");
}
