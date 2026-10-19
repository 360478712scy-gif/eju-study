import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudyClock} from '../public/study-clock.js';

class Events extends EventTarget{
  constructor(){super();this.listeners=new Set();}
  addEventListener(type,callback){super.addEventListener(type,callback);this.listeners.add(callback);}
  removeEventListener(type,callback){super.removeEventListener(type,callback);this.listeners.delete(callback);}
  fire(type){this.dispatchEvent(new Event(type));}
}
function rig(t,{stored,initialSeconds=0,storageFailure=false}={}){
  const doc=new Events(),win=new Events(),intervals=new Map(),ticks=[];
  doc.hidden=false;doc.documentElement={};
  let time=0,active=true,next=0,observed=null,disconnected=false;
  const values=new Map(stored===undefined?[]:[['clock',stored]]);
  const storage={getItem:k=>{if(storageFailure)throw Error('blocked');return values.get(k)??null;},setItem:(k,v)=>{if(storageFailure)throw Error('quota');values.set(k,v);}};
  class Observer{constructor(fn){observed=fn;}observe(){}disconnect(){disconnected=true;}}
  const dependencies={document:doc,window:win,storage,now:()=>time,setInterval:fn=>{const id=++next;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id),MutationObserver:Observer};
  const clock=createStudyClock({storageKey:'clock',isActive:()=>active,onTick:n=>ticks.push(n),initialSeconds,dependencies});
  t.after(()=>clock.stop());
  return {doc,win,clock,ticks,values,dependencies,intervals,set active(v){active=v;},advance(ms,{tick=false}={}){time+=ms;if(tick)for(const fn of [...intervals.values()])fn();},mutation(){observed?.();},get disconnected(){return disconnected;}};
}

test('seconds reads exact foreground fractions between ticks and persists a duration, not wall time',t=>{
  const r=rig(t);r.advance(1375);assert.equal(r.clock.seconds(),1.375);
  r.advance(125,{tick:true});assert.equal(r.clock.seconds(),1.5);
  assert.equal(JSON.parse(r.values.get('clock')),1.5);assert.equal(r.ticks.at(-1),1.5);
});

test('browser visibility preserves time up to hide and excludes all background time',t=>{
  const r=rig(t);r.advance(1250);r.doc.hidden=true;r.doc.fire('visibilitychange');
  r.advance(60000,{tick:true});assert.equal(r.clock.seconds(),1.25);
  r.doc.hidden=false;r.doc.fire('visibilitychange');r.advance(875);assert.equal(r.clock.seconds(),2.125);
});

test('native window events pause even when document.hidden remains false and gates compose',t=>{
  const r=rig(t);r.advance(500);r.win.fire('eju-window-hidden');
  r.advance(5000,{tick:true});r.win.fire('eju-window-hidden');assert.equal(r.clock.seconds(),.5);
  r.doc.hidden=true;r.doc.fire('visibilitychange');r.win.fire('eju-window-visible');r.advance(7000,{tick:true});assert.equal(r.clock.seconds(),.5);
  r.doc.hidden=false;r.doc.fire('visibilitychange');r.advance(500);assert.equal(r.clock.seconds(),1);
});

test('removed or submitted UI stops the old clock and never counts another popup',t=>{
  const r=rig(t);r.advance(1000,{tick:true});r.active=false;r.advance(60000);r.mutation();
  assert.equal(r.clock.seconds(),1);assert.equal(r.intervals.size,0);assert.equal(r.doc.listeners.size+r.win.listeners.size,0);assert.equal(r.disconnected,true);
  r.active=true;r.win.fire('eju-window-visible');r.advance(5000,{tick:true});assert.equal(r.clock.seconds(),1);
  const reopened=createStudyClock({storageKey:'clock',dependencies:r.dependencies});t.after(()=>reopened.stop());
  assert.equal(reopened.seconds(),1);r.advance(750);assert.equal(reopened.seconds(),1.75);
});

test('isActive guards reads and interval ticks even without MutationObserver',t=>{
  const r=rig(t);r.advance(250,{tick:true});r.active=false;r.advance(10000,{tick:true});
  assert.equal(r.clock.seconds(),.25);assert.equal(r.intervals.size,0);
});

test('stop captures the final fraction, persists once and removes every listener and interval',t=>{
  const r=rig(t);r.advance(375);assert.equal(r.clock.stop(),.375);
  assert.equal(r.intervals.size,0);assert.equal(r.doc.listeners.size+r.win.listeners.size,0);assert.equal(r.disconnected,true);
  r.advance(30000);r.win.fire('pageshow');r.win.fire('eju-window-visible');assert.equal(r.clock.stop(),.375);assert.equal(r.clock.seconds(),.375);
});

test('pagehide saves and a bfcache pageshow resumes without crediting closed time',t=>{
  const r=rig(t);r.advance(750);r.win.fire('pagehide');assert.equal(JSON.parse(r.values.get('clock')),.75);
  r.advance(90000,{tick:true});r.win.fire('pageshow');r.advance(500);assert.equal(r.clock.seconds(),1.25);
});

test('persisted duration restores, initial value only seeds empty storage and reset respects pause/stop',t=>{
  const r=rig(t,{stored:'12.5',initialSeconds:100});assert.equal(r.clock.seconds(),12.5);
  r.win.fire('eju-window-hidden');assert.equal(r.clock.reset(),0);r.advance(30000,{tick:true});assert.equal(r.clock.seconds(),0);
  r.win.fire('eju-window-visible');r.advance(250);assert.equal(r.clock.seconds(),.25);
  r.clock.stop();r.clock.reset();r.advance(5000);assert.equal(r.clock.seconds(),0);
  const fresh=rig(t,{initialSeconds:7});assert.equal(fresh.clock.seconds(),7);
});

test('invalid or unavailable storage cannot crash timing or manufacture a duration',t=>{
  for(const stored of ['not json','null','-3','"900"','{"seconds":999}']){
    const r=rig(t,{stored,initialSeconds:2});r.advance(500);assert.equal(r.clock.seconds(),2.5);r.clock.stop();
  }
  const r=rig(t,{storageFailure:true});r.advance(1250,{tick:true});assert.equal(r.clock.seconds(),1.25);
  assert.ok(r.ticks.every(n=>Number.isFinite(n)&&n>=0));
});
