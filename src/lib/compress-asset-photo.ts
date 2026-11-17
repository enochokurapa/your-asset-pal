/** Compress asset-identification photographs entirely on the user's device.
 * Original camera files are never uploaded. Result must be <= 120 KB.
 */
export async function compressAssetPhoto(original:File):Promise<File>{
 if(!["image/jpeg","image/png","image/webp"].includes(original.type))
   throw Error("Choose a JPG, PNG or WebP image");
 if(original.size>15*1024*1024)throw Error("Image is too large. Select a photo smaller than 15 MB.");
 const bitmap=await createImageBitmap(original);
 try{
  let limit=1024;
  for(let attempt=0;attempt<5;attempt++){
   const scale=Math.min(1,limit/Math.max(bitmap.width,bitmap.height));
   const width=Math.max(1,Math.round(bitmap.width*scale));
   const height=Math.max(1,Math.round(bitmap.height*scale));
   const canvas=document.createElement("canvas");
   canvas.width=width;canvas.height=height;
   const context=canvas.getContext("2d",{alpha:false});
   if(!context)throw Error("Image compression is not supported on this device");
   context.drawImage(bitmap,0,0,width,height);
   for(const quality of [0.74,0.58,0.42,0.28]){
    const result=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/webp",quality));
    if(result&&result.type==="image/webp"&&result.size>0&&result.size<=120*1024){
      return new File([result],"asset-photo.webp",{type:"image/webp",lastModified:Date.now()});
    }
   }
   limit=Math.round(limit*0.75);
  }
  throw Error("Could not compress this photo below 120 KB. Please choose a simpler photo.");
 }finally{bitmap.close()}
}
