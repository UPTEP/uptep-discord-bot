import test from 'node:test';import assert from 'node:assert/strict';import {UI} from '../src/ui.js';
test('Previously saved duplicate demands remain selectable exactly once across pages',()=>{
 const unique=Array.from({length:30},(_,i)=>({id:String(i+1),pseudo_demandeur:'Player',nbpomme_restant:'1',nbmateriaux_restant:'2'}));
 for(const type of ['cancel','adjust','deliver','validate','browse']){
 const ui=new UI({}),session={type,data:{rows:[...unique,...unique]}};
 const pages=[0,1].map(page=>ui.selection('session',session,page).components[0].toJSON().components[0].options);
 assert.deepEqual(pages.flat().map(o=>o.value),unique.map(d=>d.id));assert.equal(pages[0].length,25);assert.equal(pages[1].length,5);
 }
});
