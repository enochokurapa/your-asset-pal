import {readFileSync} from "node:fs";
import {join} from "node:path";

/** Use the verified official AssetFlow360 mark with the brand wordmark typeset beside it.
 * The historical full-width SVG has a truncated embedded PNG and cannot be exported safely. */
export function approvedAssetFlowLogoPng():Buffer {
  const root=process.cwd();
  const candidates=[
    join(root,".output","public","assetflow-approved-mark.svg"),
    join(root,"public","assetflow-approved-mark.svg"),
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
