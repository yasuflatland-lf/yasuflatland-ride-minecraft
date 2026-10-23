import type { Dimension, Entity } from "@minecraft/server";
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import type { Cell } from "../../../../src/domain/shared/cells";
import { CUT_KEPT_BLOCKS } from "../../../../src/domain/vehicle/cut";
import { BladeCuts } from "../../../../src/infrastructure/vehicle/bedrock/bladeCuts";
import { blockGrid } from "../../../support/blockGrid";
vi.mock("@minecraft/server", () => ({BlockVolume: class {constructor(public from:Cell,public to:Cell){}}}));
const column = {x:0,z:0,bottom:64};
const types = ["stone","dirt","barrier","command_block","reinforced_deepslate","light_block_15","chest","water","bedrock"].map(t=>`minecraft:${t}`).concat("yasu_ride:camper_floor");
const stack = fc.array(fc.constantFrom(...types),{minLength:1,maxLength:12});
function fixture(options: Parameters<typeof blockGrid>[0] = {}) {
 const grid = blockGrid({...options,tags:{"yasu_ride:camper_floor":["yasu_ride:laid"]}});
 const dimension = {id:"overworld",...grid};
 let tick=100;
 const cuts = new BladeCuts({now:()=>tick});
 const cut = (columns=[column])=>cuts.cut(dimension as unknown as Dimension,columns);
 const set=(y:number,type:string,x=0)=>grid.getBlock({x,y,z:0}).setType(type);
 const at=(y:number,x=0)=>grid.typeAt({x,y,z:0});
 return {grid,dimension,cuts,cut,set,at,time:(t:number)=>{tick=t;}};
}
function kept(type:string) {return CUT_KEPT_BLOCKS.includes(type)||type==="yasu_ride:camper_floor";}
it("cuts every cell from the bottom up to the first air cell and nothing above it (ADR 0137)",()=>{
 fc.assert(fc.property(stack,stack,(below,above)=>{
 const f=fixture(); f.set(63,"minecraft:stone"); below.forEach((t,i)=>f.set(64+i,t)); above.forEach((t,i)=>f.set(65+below.length+i,t)); f.cut();
 below.forEach((t,i)=>expect(f.at(64+i)).toBe(kept(t)?t:"minecraft:air"));
 above.forEach((t,i)=>expect(f.at(65+below.length+i)).toBe(t)); expect(f.at(63)).toBe("minecraft:stone"); expect(f.at(64+below.length)).toBe("minecraft:air");
 }));
});
it("cuts a fixed height in flight, through air cells too",()=>{
 fc.assert(fc.property(fc.array(fc.constantFrom(...types,"minecraft:air"),{minLength:6,maxLength:6}),cells=>{
 const f=fixture();cells.forEach((t,i)=>f.set(64+i,t));f.cuts.cut(f.dimension as unknown as Dimension,[{...column,height:3}]);
 cells.forEach((t,i)=>expect(f.at(64+i)).toBe(i<3&&!kept(t)?"minecraft:air":t));
 }));
});
it("leaves cells outside the columns untouched",()=>{const f=fixture();f.set(64,"minecraft:stone");f.set(64,"minecraft:stone",1);f.cut();expect(f.at(64,1)).toBe("minecraft:stone");});
it("makes no fill for a column whose bottom cell is air",()=>{const f=fixture();f.cut();expect(f.grid.fills).toEqual([]);});
it.each([false,true])("skips a column in an unloaded chunk and cuts it when asked again once loaded: throws=%s",throws=>{
 const f=fixture();f.set(64,"minecraft:stone");const get=vi.spyOn(f.dimension,"getBlock");
 if(throws)get.mockImplementationOnce(()=>{throw new Error("unloaded");});else get.mockReturnValueOnce(undefined as never);
 f.cut();expect(f.grid.fills).toHaveLength(0);f.cut();expect(f.at(64)).toBe("minecraft:air");
});
it("stops at the world's top",()=>{
 const f=fixture();for(let y=64;y<320;y++)f.set(y,"minecraft:stone");const get=vi.spyOn(f.dimension,"getBlock");f.cut();
 expect(f.grid.fills[0]?.to.y).toBe(319);expect(get).not.toHaveBeenCalledWith({x:0,y:320,z:0});
});
it("filters every fill by the kept types and the laid tag",()=>{const f=fixture();f.set(64,"minecraft:stone");f.cut();expect(f.grid.fills[0]?.options).toEqual({blockFilter:{excludeTypes:[...CUT_KEPT_BLOCKS],excludeTags:["yasu_ride:laid"]},ignoreChunkBoundErrors:true});});
it("a fill that throws skips only that column",()=>{
 const f=fixture();f.set(64,"minecraft:stone");f.set(64,"minecraft:stone",1);vi.spyOn(f.dimension,"fillBlocks").mockImplementationOnce(()=>{throw new Error("boom");});
 f.cut([column,{...column,x:1}]);expect(f.at(64)).toBe("minecraft:stone");expect(f.at(64,1)).toBe("minecraft:air");
});
it("cutting the same columns twice in one tick changes nothing more",()=>{
 fc.assert(fc.property(stack,cells=>{const f=fixture();cells.forEach((t,i)=>f.set(64+i,t));f.cut();const after=cells.map((_,i)=>f.at(64+i));const n=f.grid.fills.length;f.cut();expect(cells.map((_,i)=>f.at(64+i))).toEqual(after);if(after[0]==="minecraft:air")expect(f.grid.fills).toHaveLength(n);}));
});
it("removes only items that spawn next to a fill, within a tick of it (ADR 0137)",()=>{
 const offset=fc.double({min:-3,max:4,noNaN:true});
 fc.assert(fc.property(offset,offset,offset,fc.integer({min:-1,max:4}),fc.boolean(),fc.boolean(),fc.boolean(),(x,y,z,delay,item,overworld,valid)=>{
 const f=fixture();for(let y=64;y<=66;y++)f.set(y,"minecraft:stone");f.cut();f.time(100+delay);
 const remove=vi.fn();const entity={isValid:valid,typeId:item?"minecraft:item":"minecraft:cow",dimension:{id:overworld?"overworld":"nether"},location:{x,y:64+y,z},remove};
 const expected=valid&&item&&overworld&&x>=-1&&x<=2&&y>=-1&&y<=4&&z>=-1&&z<=2&&delay>=0&&delay<=1;
 expect(f.cuts.sweepDrop(entity as unknown as Entity)).toBe(expected);expect(remove).toHaveBeenCalledTimes(expected?1:0);
 }));
});
it("keeps nothing for a fill older than the window",()=>{
 const f=fixture();f.set(64,"minecraft:stone");f.cut();f.time(103);f.cut();f.time(100);
 const remove=vi.fn();expect(f.cuts.sweepDrop({isValid:true,typeId:"minecraft:item",dimension:{id:"overworld"},location:{x:0,y:64,z:0},remove} as unknown as Entity)).toBe(false);expect(remove).not.toHaveBeenCalled();
});
