import {createFileRoute,Link} from "@tanstack/react-router";
export const Route=createFileRoute("/api-docs")({
 component:APIDocumentation,
 head:()=>({meta:[{title:"AssetFlow360 API v1 documentation"},{name:"description",content:"Connect approved systems to AssetFlow360 with scoped API keys."}]})
});
const docs=[
 ["GET","/api/v1/assets?limit=100","List assets in your organisation","assets:read"],
 ["GET","/api/v1/assets/{assetId}","Retrieve one asset","assets:read"],
 ["POST","/api/v1/assets","Register a new asset","assets:write"],
 ["PATCH","/api/v1/assets/{assetId}","Update an asset's permitted fields","assets:write"],
 ["DELETE","/api/v1/assets/{assetId}","Mark an asset disposed, retaining history","assets:write"],
 ["GET","/api/v1/assets/{assetId}/files","List attachment metadata and 5-minute private download URLs","files:read"],
 ["POST","/api/v1/assets/{assetId}/files","Attach a small PDF/image, base64 JSON","files:write"],
 ["GET","/api/v1/locations","List business locations","locations:read"],
 ["GET","/api/v1/branches","List business branches","branches:read"],
 ["POST","/api/v1/tracking/events","Record registered-device GPS telemetry","tracking:write + live tracking add-on"],
];
function APIDocumentation(){
 return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
 <div className="mx-auto max-w-5xl space-y-7 rounded-2xl bg-white p-5 shadow-sm sm:p-10">
 <nav className="text-sm"><Link to="/" className="font-semibold text-indigo-700">AssetFlow360 Home</Link></nav>
 <header className="space-y-2"><h1 className="text-3xl font-bold">AssetFlow360 API v1</h1>
 <p className="text-slate-600">Integration guide for authorised organisations. API access is a paid add-on and must be enabled for your workspace.</p></header>
 <section className="space-y-3"><h2 className="text-xl font-bold">Authentication</h2>
 <p>Generate an integration key from your workspace’s Integrations page. Store it on your server, never in a public website or spreadsheet cell. The complete key is displayed only once.</p>
 <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-sm text-white">{'GET https://assetflow360.com/api/v1/assets?limit=10\nAuthorization: Bearer af_live_YOUR_API_KEY'}</pre>
 <p className="text-sm">Keys are bound to one organisation, subject to individual scopes, the active subscription and the paid API entitlement. Keys can be revoked at any time.</p></section>
 <section><h2 className="mb-3 text-xl font-bold">Available endpoints</h2>
 <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm">
 <thead><tr className="bg-slate-100"><th className="p-3">Method</th><th className="p-3">Endpoint</th><th className="p-3">Purpose</th><th className="p-3">Required permission</th></tr></thead>
 <tbody>{docs.map(([verb,path,description,scope])=><tr key={path+verb} className="border-b">
 <td className="p-3 font-bold">{verb}</td><td className="p-3 font-mono text-xs">{path}</td>
 <td className="p-3">{description}</td><td className="p-3 font-mono text-xs">{scope}</td></tr>)}</tbody></table></div></section>
 <section className="space-y-3"><h2 className="text-xl font-bold">Create an asset</h2>
 <p>Use an API key with <code>assets:write</code>. Asset numbers are generated safely by the server. Subscription capacity and organisation reference checks still apply.</p>
 <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-sm text-white">{'POST /api/v1/assets\nContent-Type: application/json\nAuthorization: Bearer af_live_...\n\n{\n  "name": "Office Laptop",\n  "asset_tag": "IT-0020",\n  "serial_number": "LAP-001",\n  "status": "in_use",\n  "purchase_value": 2000000\n}'}</pre>
 <p>PATCH supports <code>name, asset_tag, serial_number, description, category_id, location_id, branch_id, status, condition, purchase_value, purchase_date</code> and <code>custom_fields</code>. Unknown fields are rejected.</p>
 <p><strong>Deletion:</strong> DELETE sets status to <code>disposed</code>; it does not erase asset history or verification evidence.</p></section>
 <section className="space-y-3"><h2 className="text-xl font-bold">Documents and photos</h2>
 <p>GET <code>/assets/{'{assetId}'}/files</code> returns private download links valid for five minutes. POST to the same path supports an image or PDF no larger than 2 MB using JSON fields <code>kind</code> (image, invoice, receipt, warranty, other), <code>file_name</code>, <code>content_type</code> and <code>data_base64</code>. Larger files should use the web app.</p>
 <p>Asset files reside privately in Cloudflare R2 under tenant-specific prefixes. Never share API credentials with untrusted parties.</p></section>
 <section className="space-y-3"><h2 className="text-xl font-bold">Tracking devices</h2>
 <p>Tracking is a separate paid add-on. Register and enable the device first; then send GPS telemetry with provider, external_device_id, latitude, longitude, and optional accuracy, speed, heading, recorded_at, metadata. Location reporting does not imply the system can remotely control hardware.</p></section>
 <section className="space-y-2"><h2 className="text-xl font-bold">Responses and limits</h2>
 <p>JSON responses contain <code>data</code> and optional <code>meta</code>. HTTP 401 indicates missing or invalid credentials, 403 indicates missing permission or subscription, 404 means a record is not found, and 409 indicates a validation or lifecycle conflict. GET list requests default to 100 records, up to 500. API keys have a basic per-instance limit of 120 requests per minute; HTTP 429 indicates rate limiting.</p>
 <p className="text-sm text-slate-600">Use a separate test workspace and read-only key first. This API is version 1; additional workflow endpoints require separate releases and documentation.</p></section>
 </div></main>;
}
