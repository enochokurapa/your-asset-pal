import {createAssetFlowActivationReceipt} from "../src/lib/assetflow-activation-receipt.server";
const pdf=createAssetFlowActivationReceipt({
 receiptNo:"TEST-ONLY-0001",workspace:"Sample Organisation Ltd",plan:"Paid Subscription",
 activatedAt:new Date("2026-11-18T08:00:00Z"),expiresAt:new Date("2027-11-18T08:00:00Z"),
 users:"4",assets:"Unlimited",method:"Bank transfer",amount:4000000,currency:"UGX",
 paymentReference:"TEST-TRANSACTION",paid:true
});
if(pdf.subarray(0,4).toString()!=="%PDF"||pdf.length<7000||pdf.length>512*1024)
 throw Error("Receipt PDF invalid or too large to send by email");
console.log("BRANDED_RECEIPT_PDF_VALID",pdf.length);
