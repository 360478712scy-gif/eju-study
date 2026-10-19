import {chromium} from 'playwright';
import {createServer} from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Independent module fixture: no real study state and no OS clipboard writes.
// Clipboard hooks use per-page memory; browser input/selection/undo are real.
const root=path.resolve(import.meta.dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'eju-desktop-ui-')),passed=[],errors=[];
const pass=label=>{passed.push(label);console.log('PASS',label);};
const html=`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/desktop-ui.css"><style>body{font:16px sans-serif;margin:24px;min-height:80vh}textarea,input,[contenteditable]{box-sizing:border-box;display:block;width:100%;margin:12px 0;padding:8px}#surface{padding:22px;background:#ecf3e6}#app-modal{border:1px solid #abc;padding:12px}</style></head><body><button id="anchor">学习页面</button><p id="selection">日本語の単語を復習する。</p><div id="surface">学习空白区</div><textarea id="draft"></textarea><input id="readonly" readonly value="只读材料"><input id="password" type="password" value="private"><div id="rich" contenteditable="true">原有笔记</div><select id="select"><option>日语</option></select><section id="app-modal"><textarea id="modal-draft">尚未保存的日语原文。</textarea></section><script type="module">
import {initDesktopUI} from '/desktop-ui.js';
window.calls=[];window.notices=[];window.clipboard='粘贴内容';window.delayClipboard=false;window.legacyEscape=0;
window.controls=initDesktopUI({standalone:true,isMac:true,navigate:page=>calls.push(['navigate',page]),toggleMusic:()=>calls.push(['music']),toggleFocus:()=>calls.push(['focus']),closeOverlay:()=>calls.push(['close']),notify:text=>notices.push(text),readClipboard:()=>delayClipboard?new Promise(resolve=>window.resolveClipboard=resolve):Promise.resolve(clipboard),writeClipboard:text=>{clipboard=text;return Promise.resolve();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')legacyEscape++;});window.ready=true;
</script></body></html>`;
const server=createServer((req,res)=>{
 const files={'/desktop-ui.js':['public/desktop-ui.js','text/javascript'],'/desktop-ui.css':['public/desktop-ui.css','text/css']};
 if(files[req.url]){const [file,type]=files[req.url];res.writeHead(200,{'Content-Type':type});res.end(fs.readFileSync(path.join(root,file)));}
 else if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}
 else {res.writeHead(204);res.end();}
});
let browser,page,step='startup';
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:process.env.EJU_CHROMIUM_PATH||'~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
 page=await browser.newPage({viewport:{width:1100,height:900}});page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);await page.waitForFunction(()=>window.ready);
 const command=async detail=>page.evaluate(detail=>window.dispatchEvent(new CustomEvent('eju-command',{detail})),detail);
 const settle=()=>page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
 const event=async(key,extra={},selector='body')=>page.evaluate(({key,extra,selector})=>{const e=new KeyboardEvent('keydown',{key,metaKey:true,bubbles:true,cancelable:true,...extra});document.querySelector(selector).dispatchEvent(e);return e.defaultPrevented;},{key,extra,selector});
 const context=async(selector,x=1092,y=892)=>{await page.locator(selector).dispatchEvent('contextmenu',{clientX:x,clientY:y,bubbles:true,cancelable:true});await page.locator('.eju-context-menu').waitFor();};
 const menuClick=action=>page.locator(`[data-eju-menu-action="${action}"]`).click();

 step='native protocol';
 await command({action:'navigate',page:'learning'});await settle();await command({action:'navigate',page:'invalid'});await command({action:'toggle-music'});await command({action:'toggle-focus'});await command({action:'toggle-music',repeat:true});await settle();
 assert.deepEqual(await page.evaluate(()=>calls),[['navigate','learning'],['music'],['focus']]);
 pass('native command protocol validates page names, routes app controls and ignores repeated commands');

 step='keyboard and IME';
 await page.locator('#anchor').focus();for(const [key,name] of [['1','today'],['2','learning'],['3','notebook'],['4','report']]){await page.keyboard.press('Meta+'+key);await settle();assert.deepEqual(await page.evaluate(()=>calls.at(-1)),['navigate',name]);}
 await page.keyboard.press('Meta+Shift+M');await settle();assert.deepEqual(await page.evaluate(()=>calls.at(-1)),['music']);await page.keyboard.press('Meta+Shift+F');await settle();assert.deepEqual(await page.evaluate(()=>calls.at(-1)),['focus']);
 const count=await page.evaluate(()=>calls.length);assert.equal(await event('m',{shiftKey:true,repeat:true}),true);assert.equal(await event('1',{isComposing:true}),false);assert.equal(await event('1',{keyCode:229}),false);
 await page.locator('#draft').dispatchEvent('compositionstart');assert.equal(await event('1',{},'#draft'),false);assert.equal(await event('Escape',{metaKey:false},'#draft'),false);await page.locator('#draft').dispatchEvent('compositionend');assert.equal(await page.evaluate(()=>calls.length),count);
 pass('Cmd navigation and controls work while held keys and Japanese IME composition cannot trigger actions');

 step='editing and draft guard';
 await page.locator('#draft').fill('未保存の日本語');await page.keyboard.press('Meta+2');await settle();assert.equal(await page.locator('#draft').inputValue(),'未保存の日本語');assert.equal(await page.evaluate(()=>calls.length),count);assert.ok((await page.evaluate(()=>notices.at(-1))).includes('保存'));
 await page.locator('#anchor').focus();await command({action:'navigate',page:'today'});await settle();assert.equal(await page.evaluate(()=>calls.length),count,'blurred unsaved text is still protected');
 for(const letter of ['c','v','x','a','z'])assert.equal(await event(letter,{},'#draft'),false,letter);
 for(const letter of ['r','l','t','n','p','f','[',']','+','=','-','0'])assert.equal(await event(letter),true,letter);
 assert.equal(await event('Backspace',{metaKey:false}),true);assert.equal(await event('Backspace',{metaKey:false},'#draft'),false);
 await page.evaluate(()=>controls.clearDirty());await page.locator('#anchor').focus();await command({action:'navigate',page:'today'});await settle();assert.deepEqual(await page.evaluate(()=>calls.at(-1)),['navigate','today']);
 pass('unsaved text survives keyboard/native navigation; editing shortcuts remain native and browser chrome shortcuts are blocked');

 step='context positioning and keyboard';
 await context('#surface');let box=await page.locator('.eju-context-menu').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=1100&&box.y+box.height<=900);
 assert.equal(await page.locator('.eju-context-menu [role="menuitem"]').count(),7);await page.keyboard.press('End');assert.equal(await page.locator(':focus').getAttribute('data-eju-menu-action'),'shortcuts');await page.keyboard.press('ArrowDown');assert.equal(await page.locator(':focus').getAttribute('data-eju-menu-action'),'navigate:today');await page.keyboard.press('ArrowUp');assert.equal(await page.locator(':focus').getAttribute('data-eju-menu-action'),'shortcuts');await page.keyboard.press('Home');assert.equal(await page.locator(':focus').getAttribute('data-eju-menu-action'),'navigate:today');await page.keyboard.press('Escape');assert.equal(await page.locator('.eju-context-menu').count(),0);assert.equal(await page.evaluate(()=>legacyEscape),0,'IME Escape must remain available to composition without reaching the old modal closer');
 pass('right-click menu stays inside the viewport and supports wrapping arrow keys, Home, End and isolated Escape');

 step='copy selection and input editing';
 await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('#selection'));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});await context('#selection');await menuClick('copy');await settle();assert.equal(await page.evaluate(()=>clipboard),'日本語の単語を復習する。');
 await page.locator('#draft').fill('日本語の草稿');await page.evaluate(()=>{const e=document.querySelector('#draft');e.focus();e.setSelectionRange(2,3);clipboard='公式';});await context('#draft');await menuClick('paste');await settle();assert.equal(await page.locator('#draft').inputValue(),'日本公式の草稿');await page.keyboard.press('Meta+z');assert.equal(await page.locator('#draft').inputValue(),'日本語の草稿');
 await context('#draft');await menuClick('select-all');assert.deepEqual(await page.locator('#draft').evaluate(e=>[e.selectionStart,e.selectionEnd]),[0,6]);await context('#draft');await menuClick('cut');await settle();assert.equal(await page.locator('#draft').inputValue(),'');assert.equal(await page.evaluate(()=>clipboard),'日本語の草稿');await context('#draft');await menuClick('undo');assert.equal(await page.locator('#draft').inputValue(),'日本語の草稿');
 await context('#readonly');assert.equal(await page.locator('[data-eju-menu-action="paste"]').count(),0);assert.equal(await page.locator('[data-eju-menu-action="cut"]').count(),0);await page.keyboard.press('Escape');
 await page.locator('#rich').evaluate(e=>{e.innerHTML='<span id="rich-child">原有笔记</span>';e.focus();const range=document.createRange();range.selectNodeContents(e);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);window.clipboard='＋补充';});await context('#rich-child');await menuClick('paste');await settle();assert.equal(await page.locator('#rich').innerText(),'原有笔记＋补充');await page.keyboard.press('Meta+z');assert.equal(await page.locator('#rich').innerText(),'原有笔记');
 pass('selected text copies, input and contenteditable paste preserve undo, and editing respects read-only controls');

 step='asynchronous clipboard safety';
 await page.locator('#draft').fill('原文');await page.evaluate(()=>{const e=document.querySelector('#draft');e.focus();e.select();delayClipboard=true;});await context('#draft');await menuClick('paste');await page.waitForFunction(()=>!!window.resolveClipboard);await page.locator('#draft').fill('刚刚改好的新内容');await page.evaluate(()=>{resolveClipboard('迟到的剪贴板');delayClipboard=false;});await settle();assert.equal(await page.locator('#draft').inputValue(),'刚刚改好的新内容');assert.match(await page.evaluate(()=>notices.at(-1)),/内容已变化/);
 pass('a delayed clipboard read never overwrites text edited while permission was pending');

 step='help overlay and native editing contexts';
 const original=await page.locator('#modal-draft').inputValue();await command({action:'shortcuts'});await page.locator('.eju-shortcuts').waitFor();assert.equal(await page.locator('#modal-draft').inputValue(),original);await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('data-eju-close-help'),'');const closes=await page.evaluate(()=>calls.filter(x=>x[0]==='close').length);await page.keyboard.press('Escape');assert.equal(await page.locator('.eju-shortcuts').count(),0);assert.equal(await page.evaluate(()=>calls.filter(x=>x[0]==='close').length),closes);await page.keyboard.press('Escape');await settle();assert.equal(await page.evaluate(()=>calls.filter(x=>x[0]==='close').length),closes+1);await event('Escape',{metaKey:false,repeat:true});await settle();assert.equal(await page.evaluate(()=>calls.filter(x=>x[0]==='close').length),closes+1);assert.equal(await page.evaluate(()=>legacyEscape),0);
 for(const selector of ['#password','#select'])assert.equal(await page.locator(selector).evaluate(e=>{const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});e.dispatchEvent(event);return event.defaultPrevented;}),false);
 pass('shortcut help preserves the active form; Escape closes one layer and native secure/select controls remain intact');

 step='navigation drops and mobile';
 const drop=async(kind,selector)=>page.locator(selector).evaluate((node,kind)=>{const transfer=new DataTransfer();if(kind==='file')transfer.items.add(new File(['qa'],'notes.txt'));else if(kind==='uri')transfer.setData('text/uri-list','https://example.com');else transfer.setData('text/plain',kind==='url'?'https://example.com':'普通文字');const event=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer});node.dispatchEvent(event);return event.defaultPrevented;},kind);
 assert.equal(await drop('file','body'),true);assert.equal(await drop('uri','body'),true);assert.equal(await drop('url','body'),true);assert.equal(await drop('url','#draft'),false);assert.equal(await drop('text','body'),false);assert.equal(page.url(),base+'/');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(60);await page.locator('#anchor').focus();await context('#surface',386,840);box=await page.locator('.eju-context-menu').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=390&&box.y+box.height<=844);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(dir,'mobile-context.png')});await page.keyboard.press('Escape');await command({action:'shortcuts'});await page.locator('.eju-shortcuts').waitFor();const helpBox=await page.locator('.eju-shortcuts').boundingBox();assert.ok(helpBox.x>=0&&helpBox.y>=0&&helpBox.x+helpBox.width<=390&&helpBox.y+helpBox.height<=844,'help overlay must fit its viewport');assert.ok(await page.locator('.eju-shortcuts').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'help content must not clip horizontally');await page.screenshot({path:path.join(dir,'mobile-shortcuts.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.keyboard.press('Escape');
 pass('file and URL drops cannot navigate the window, while text editing and 390px menu/help layouts remain usable');

 step='cleanup';
 const beforeDestroy=await page.evaluate(()=>calls.length);await page.evaluate(()=>controls.destroy());await command({action:'toggle-music'});await settle();assert.equal(await page.evaluate(()=>calls.length),beforeDestroy);assert.equal(await page.locator('#surface').evaluate(node=>{const e=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});node.dispatchEvent(e);return e.defaultPrevented;}),false);assert.deepEqual(errors,[]);
 pass('destroy removes handlers cleanly and all browser checks finish without JavaScript errors');
 fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({ok:true,passed,errors},null,2));console.log('ARTIFACTS',dir);
}catch(error){if(page)await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({ok:false,step,error:String(error.stack||error),passed,errors},null,2));console.error('FAILED',step,'ARTIFACTS',dir);throw error;}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
