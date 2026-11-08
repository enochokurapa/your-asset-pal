/** Consistent, server-rendered SEO metadata for each indexable public route.
 * Never put organisation account, billing, or private application URLs in a sitemap. */
const base="https://assetflow360.com";
export function publicHead(path:string,title:string,description:string){
  const canonical=new URL(path,base).toString();
  return {
    meta:[
      {title},
      {name:"description",content:description},
      {name:"robots",content:"index, follow, max-image-preview:large"},
      {name:"keywords",content:"fixed asset management software, fixed asset register software, asset tracking system, asset verification, depreciation software, international fixed asset management, global asset register software, worldwide asset tracking, multi-location fixed asset tracking, asset lifecycle management, asset management Uganda, asset management Kenya, asset management Nigeria"},
      {property:"og:type",content:"website"},
      {property:"og:locale",content:"en_US"},
      {property:"og:site_name",content:"AssetFlow 360"},
      {property:"og:title",content:title},
      {property:"og:description",content:description},
      {property:"og:url",content:canonical},
      {property:"og:image",content:base+"/api/branding/logo.png"},
      {property:"og:image:alt",content:"AssetFlow 360 official logo"},
      {name:"twitter:card",content:"summary_large_image"},
      {name:"twitter:image",content:base+"/api/branding/logo.png"},
      {name:"twitter:title",content:title},
      {name:"twitter:description",content:description},
    ],
    links:[{rel:"canonical",href:canonical}],
  };
}
