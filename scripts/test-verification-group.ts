import {verificationGroup} from "../src/lib/asset-verification-kpi";
if(verificationGroup(undefined,{status:"verified"})!=="inspected")throw Error("Historical verification must survive retirement");
if(verificationGroup(undefined)!=="registered")throw Error("Unscheduled assets must not be marked overdue");
if(verificationGroup({asset_id:"1",verification_state:"current",verification_basis:"physical_verification",latest_verification_status:"verified"})!=="inspected")throw Error("New verified assets must be green");
if(verificationGroup({asset_id:"2",verification_state:"overdue",verification_basis:"registration_baseline",latest_verification_status:null})!=="attention")throw Error("Overdue scheduled assets must need attention");
console.log("VERIFICATION_GROUPING_TESTS_PASS");
