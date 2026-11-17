import {createAssetFlowActivationReceipt} from "../src/lib/assetflow-activation-receipt.server";
const sample=createAssetFlowActivationReceipt({
 receiptNo:"TEST-2026-1117",workspace:"Sample Organisation",plan:"Business",
 activatedAt:new Date("2026-11-17T12:00:00Z"),
 expiresAt:new Date("2027-11-17T12:00:00Z"),
 users:"4",assets:"Unlimited",method:"Cash",amount:4000000,currency:"UGX",
 paymentReference:"CASH-TEST",paid:true
});
if(sample.subarray(0,5).toString()!=="%PDF-")throw Error("PDF output has an invalid header");
if(sample.length<1200||sample.length>700000)throw Error("PDF has an unexpected size");
console.log("ACTIVATION_RECEIPT_PDF_OK",sample.length);
