'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {defaults,validate,ROUTINES}=require('../lib/config');
test('Fixed names are restored on save/import without changing actions or enabled states',()=>{
 const c=defaults();c.routines.forEach((r,i)=>{r.name='Changed '+i;r.enabled=!!(i%2);});
 c.routines[0].actions=[{id:'keep',kind:'timeline',text:'Keep me',category:'other',delaySeconds:5,onError:'continue'}];
 c.routines.push({id:'custom-evening',name:'Min kveld',enabled:false,execution:'parallel',actions:[]});
 const before=structuredClone(c),v=validate(c);
 for(const r of v.routines){assert.equal(r.name,ROUTINES[r.id] || 'Min kveld');assert.deepEqual({...r,name:''},{...c.routines.find(old=>old.id===r.id),name:''});}
 assert.deepEqual(c,before);assert.deepEqual(validate(v),v);
});
test('Old or imported optional-home mornings become mandatory-home without other changes',()=>{
 const c=defaults();c.morning.requireHome=false;c.morning.scheduled=true;
 const v=validate(c);assert.equal(v.morning.requireHome,true);assert.deepEqual(v,{...c,morning:{...c.morning,requireHome:true}});assert.equal(c.morning.requireHome,false);
});
