import { test, expect } from "bun:test";
import { builderList, builderPayload } from "../src/lib/builder-response";

test("plain array of saved definitions",()=>expect(builderList([{id:"a",name:"A"}])).toEqual([{id:"a",name:"A"}]));
test("wrapped list response",()=>expect(builderList({data:{result:[{id:"a",name:"A"}]}})).toHaveLength(1));
test("save response preserved",()=>expect(builderPayload({data:{id:"a",definitions:[]}})).toEqual({id:"a",definitions:[]}));
test("invalid catalog rejected",()=>expect(()=>builderList({hello:"world"})).toThrow());
test("server errors not masked",()=>expect(()=>builderList({error:{message:"Authentication expired"}})).toThrow("Authentication expired"));
test("HTML is never accepted as saved data",()=>expect(()=>builderPayload("<html>Failure</html>")).toThrow("HTML"));
