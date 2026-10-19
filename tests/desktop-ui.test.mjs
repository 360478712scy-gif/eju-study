import test from 'node:test';
import assert from 'node:assert/strict';
import {DESKTOP_PAGES,getDesktopShortcut,isTextEditor} from '../public/desktop-ui.js';
const key=(key,extra={})=>({key,metaKey:true,ctrlKey:false,altKey:false,shiftKey:false,...extra});
const options={isMac:true,standalone:true};
test('desktop navigation and controls have one explicit native-compatible command mapping',()=>{
 Object.keys(DESKTOP_PAGES).forEach((page,i)=>assert.deepEqual(getDesktopShortcut(key(String(i+1)),options),{action:'navigate',page}));
 assert.deepEqual(getDesktopShortcut(key('M',{shiftKey:true}),options),{action:'toggle-music'});
 assert.deepEqual(getDesktopShortcut(key('F',{shiftKey:true}),options),{action:'toggle-focus'});
 assert.deepEqual(getDesktopShortcut(key('/'),options),{action:'shortcuts'});
 assert.equal(getDesktopShortcut(key('1',{metaKey:false,ctrlKey:true}),options),null);
 assert.deepEqual(getDesktopShortcut(key('1',{metaKey:false,ctrlKey:true}),{isMac:false}),{action:'navigate',page:'today'});
});
test('IME, existing handlers and native text editing keep their keyboard events',()=>{
 for(const variant of [{isComposing:true},{keyCode:229},{defaultPrevented:true},{altKey:true}])assert.equal(getDesktopShortcut(key('1',variant),options),null);
 for(const letter of ['c','v','x','a','z'])for(const shiftKey of [false,true])assert.equal(getDesktopShortcut(key(letter,{shiftKey}),options),null);
 assert.equal(getDesktopShortcut(key('Process'),options),null);
});
test('browser chrome shortcuts are suppressed only in standalone windows and repeat never retoggles',()=>{
 for(const letter of ['r','l','t','n','p','f','[',']','+','=','-','0']){
  assert.equal(getDesktopShortcut(key(letter),options)?.action,'blocked',letter);
  assert.equal(getDesktopShortcut(key(letter),{isMac:true,standalone:false}),null,letter);
 }
 assert.equal(getDesktopShortcut(key('m',{shiftKey:true,repeat:true}),options)?.action,'blocked');
 assert.equal(getDesktopShortcut(key('Backspace',{metaKey:false}),options)?.action,'blocked');
 assert.equal(getDesktopShortcut(key('Backspace',{metaKey:false}),{...options,editable:true}),null);
});
test('text editors include contenteditable and read-only text, while select and non-text inputs keep native controls',()=>{
 for(const type of ['text','search','email','url','tel','password','number'])assert.equal(isTextEditor({tagName:'INPUT',type}),true);
 assert.equal(isTextEditor({tagName:'TEXTAREA',readOnly:true}),true);
 assert.equal(isTextEditor({tagName:'DIV',isContentEditable:true}),true);
 for(const node of [{tagName:'INPUT',type:'checkbox'},{tagName:'SELECT'},{tagName:'TEXTAREA',disabled:true},null])assert.equal(isTextEditor(node),false);
});
