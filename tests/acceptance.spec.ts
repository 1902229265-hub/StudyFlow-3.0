import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';

type LabPage=Page;
async function call(page:LabPage,method:string,...args:unknown[]) {return page.evaluate(async({method,args})=>{const mod=await import(/* @vite-ignore */ '/src/App.tsx');return await (mod.service as any)[method](...args)},{method,args})}
async function snapshot(p:Page){return await call(p,'getSnapshot')as any}
async function ready(p:Page,url='/?date=2026-11-10'){await p.goto(url);await p.waitForFunction(async()=>{try{const m=await import(/* @vite-ignore */ '/src/App.tsx');return m.service.getSnapshot().ready}catch{return false}});await expect(p.locator('.focus-stage')).toBeVisible()}
async function elapsed(p:Page){const s=await snapshot(p);const a=s.sessions.find((x:any)=>x.id===s.activeSessionId)||s.sessions.at(-1);return a?await call(p,'elapsed',a):0}
async function evidence(name:string,data:unknown){await fs.writeFile(new URL('../evidence/acceptance-'+name+'.json',import.meta.url),JSON.stringify(data,null,2))}

test.beforeEach(async({context})=>{await context.addInitScript(()=>{
 const original={get:Storage.prototype.getItem,set:Storage.prototype.setItem,remove:Storage.prototype.removeItem,clear:Storage.prototype.clear};
 (window as any).__protectedStorage=[];
 for(const method of ['getItem','setItem','removeItem']as const){const fn=Storage.prototype[method];(Storage.prototype as any)[method]=function(key:string,...rest:unknown[]){if(key==='studyflow.data.v1'||key==='studyflow.theme'){(window as any).__protectedStorage.push({method,key});throw Error('Protected formal storage accessed')}return(fn as any).call(this,key,...rest)}}
 Storage.prototype.clear=function(){(window as any).__protectedStorage.push({method:'clear'});throw Error('No storage clears in lab')};
 const open=indexedDB.open.bind(indexedDB);indexedDB.open=function(name:string,version?:number){if(!name.startsWith('studyflow.lab.focus.'))throw Error('Unexpected IndexedDB namespace '+name);return version===undefined?open(name):open(name,version)};
})});

test('UI timer real lifecycle, independent completion and persisted history',async({page})=>{
 await ready(page);let s=await snapshot(page);expect(s.sessions).toHaveLength(0);expect(s.tasks.find((t:any)=>t.id==='pm-004').completed).toBe(false);
 await page.getByTestId('timer-start').click();await expect.poll(async()=>(await snapshot(page)).sessions.at(-1)?.status).toBe('running');await expect(page.getByTestId('mini-timer').first()).toBeVisible();
 await page.waitForTimeout(1200);await page.getByTestId('timer-pause').click();await expect.poll(async()=>(await snapshot(page)).sessions.at(-1)?.status).toBe('paused');const paused=await elapsed(page);await page.waitForTimeout(1200);expect(await elapsed(page)).toBe(paused);
 await page.getByTestId('timer-resume').click();await page.waitForTimeout(1100);await page.getByTestId('timer-end').click();await expect.poll(async()=>(await snapshot(page)).activeSessionId).toBeNull();s=await snapshot(page);expect(s.activeSessionId).toBeNull();expect(s.sessions).toHaveLength(1);expect(s.sessions[0].status).toBe('ended');expect(s.tasks.find((t:any)=>t.id==='pm-004').completed).toBe(false);const first=await call(page,'elapsed',s.sessions[0])as number;expect(first).toBeGreaterThan(1500);expect(first).toBeLessThan(6500);
 await page.reload();await ready(page);const restored=await snapshot(page);expect(restored.sessions[0].id).toBe(s.sessions[0].id);expect(await call(page,'elapsed',restored.sessions[0])).toBe(first);
 await page.getByTestId('timer-start').click();await page.waitForTimeout(300);await page.getByTestId('timer-end').click();s=await snapshot(page);expect(s.sessions).toHaveLength(2);expect(new Set(s.sessions.map((x:any)=>x.id)).size).toBe(2);
 const db=await page.evaluate(async()=>{const r=indexedDB.open('studyflow.lab.focus.v1');return await new Promise(resolve=>{r.onsuccess=()=>{const d=r.result;const stores=[...d.objectStoreNames];const t=d.transaction(stores,'readonly');const result:any={stores};for(const name of stores){const a=t.objectStore(name).getAll();a.onsuccess=()=>result[name]=a.result}t.oncomplete=()=>{d.close();resolve(result)}}})});await evidence('lifecycle-indexeddb',{snapshot:s,db,protectedStorage:await page.evaluate(()=>(window as any).__protectedStorage)});
 expect(await page.evaluate(()=>(window as any).__protectedStorage)).toEqual([]);
});

test('normal refresh running resumes without resetting confirmed time',async({page})=>{
 await ready(page);await page.getByTestId('timer-start').click();await page.waitForTimeout(2300);const before=await snapshot(page);const value=await elapsed(page);await page.reload();await page.waitForFunction(async()=>{const m=await import(/* @vite-ignore */'/src/App.tsx');return m.service.getSnapshot().ready});
 const after=await snapshot(page);expect(after.activeSessionId).toBe(before.activeSessionId);expect(after.sessions.find((s:any)=>s.id===after.activeSessionId)?.status).toBe('running');expect(await elapsed(page)).toBeGreaterThanOrEqual(value-300);await page.waitForTimeout(1200);const later=await elapsed(page);expect(later).toBeGreaterThan(value+700);await evidence('reload',{before,after,beforeElapsed:value,afterElapsed:later});await call(page,'end');
});

test('3-hour simulated clock, pause exclusion and date split',async({page})=>{
 await page.clock.install({time:new Date('2026-11-13T23:50:00+08:00')});await ready(page);await call(page,'start','pm-004');await page.clock.fastForward(20*60*1000);await call(page,'pause');const active=await elapsed(page);expect(active).toBeGreaterThanOrEqual(20*60*1000-100);expect(active).toBeLessThan(20*60*1000+1500);
 const day1=await call(page,'daily','2026-11-13')as any,day2=await call(page,'daily','2026-11-14')as any;expect(day1.actualMs).toBeCloseTo(10*60*1000,-3);expect(day2.actualMs).toBeCloseTo(10*60*1000,-3);
 await page.clock.fastForward(2*60*60*1000);expect(await elapsed(page)).toBe(active);await call(page,'resume');await page.clock.fastForward(40*60*1000);await call(page,'end');const s=await snapshot(page);const total=await call(page,'elapsed',s.sessions[0])as number;expect(total).toBeGreaterThanOrEqual(60*60*1000-100);expect(total).toBeLessThan(60*60*1000+2000);await evidence('simulated-long-midnight',{day1,day2,total,sessions:s.sessions,simulation:'Playwright clock: 20min running +2h pause +40min running; not recorded personal history'});
});

test('route/date changes and task completion never reset or stop active session',async({page})=>{
 await ready(page);await page.getByTestId('timer-start').click();await expect.poll(async()=>(await snapshot(page)).activeSessionId).not.toBeNull();const id=(await snapshot(page)).activeSessionId;await call(page,'setCompleted','pm-004',true);expect((await snapshot(page)).activeSessionId).toBe(id);expect((await snapshot(page)).sessions[0].status).toBe('running');
 for(const route of ['library','plan','review','today']){await page.evaluate(r=>location.hash=r,route);await expect(page.getByTestId('mini-timer').first()).toBeVisible();expect((await snapshot(page)).activeSessionId).toBe(id)}
 await page.locator('[data-date="2026-11-11"]').first().click();expect((await snapshot(page)).activeSessionId).toBe(id);await page.waitForTimeout(600);expect(await elapsed(page)).toBeGreaterThan(300);await call(page,'end');
});

test('two tabs concurrent start/pause/end share one canonical session, no duplicate tally',async({context,page})=>{
 await ready(page);const second=await context.newPage();await ready(second);const results=await Promise.allSettled([call(page,'start','pm-004'),call(second,'start','pm-005')]);await expect.poll(async()=>(await snapshot(second)).sessions.length).toBe(1);const a=await snapshot(page),b=await snapshot(second);expect(a.activeSessionId).toBe(b.activeSessionId);expect(a.sessions).toHaveLength(1);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 await page.waitForTimeout(1400);await expect(call(second,'pause')).rejects.toThrow('请在持有计时控制的标签页操作');await call(page,'pause');await expect.poll(async()=>(await snapshot(page)).sessions[0]?.status).toBe('paused');const held=await elapsed(page);await page.waitForTimeout(1000);expect(await elapsed(second)).toBe(held);const ended=await Promise.allSettled([call(page,'end'),call(second,'end')]);expect(ended.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(ended.filter(r=>r.status==='rejected')).toHaveLength(1);await expect.poll(async()=>(await snapshot(page)).activeSessionId).toBeNull();const end=await snapshot(page);expect(end.sessions).toHaveLength(1);expect(await call(page,'elapsed',end.sessions[0])).toBe(held);await evidence('multi-tab',{results:results.map(r=>({status:r.status})),before:a,after:end,held});
});

test('closed owner gap defaults excluded and explicit include remains auditable',async({context,page})=>{
 await ready(page);await page.getByTestId('timer-start').click();await page.waitForTimeout(2300);const before=await snapshot(page);await page.close();await new Promise(r=>setTimeout(r,1600));const reopened=await context.newPage();await ready(reopened);await expect.poll(async()=>(await snapshot(reopened)).sessions[0]?.status).toBe('recovering');const pending=await snapshot(reopened);const confirmed=await elapsed(reopened);await reopened.waitForTimeout(1100);expect(await elapsed(reopened)).toBe(confirmed);await reopened.getByTestId('recovery-exclude').click();await expect.poll(async()=>(await snapshot(reopened)).sessions[0]?.status).toBe('paused');expect(await elapsed(reopened)).toBe(confirmed);await call(reopened,'resume');await reopened.waitForTimeout(1300);await reopened.close();await new Promise(r=>setTimeout(r,1200));const third=await context.newPage();await ready(third);await expect.poll(async()=>(await snapshot(third)).sessions[0]?.status).toBe('recovering');const beforeInclude=await elapsed(third);await third.getByTestId('recovery-include').click();await expect.poll(async()=>(await snapshot(third)).sessions[0]?.status).toBe('paused');const afterInclude=await elapsed(third);expect(afterInclude).toBeGreaterThan(beforeInclude);const final=await snapshot(third);expect(final.sessions[0].segments.some((s:any)=>s.kind==='recovered')).toBe(true);await evidence('abnormal-recovery',{before,pending,confirmed,beforeInclude,afterInclude,after:final});await call(third,'end');
});

test('storage open denial produces explicit failure, never false save success',async({context})=>{
 await context.addInitScript(()=>{indexedDB.open=()=>{throw new DOMException('QA blocked storage','SecurityError')}});const page=await context.newPage();await page.goto('/');await expect(page.getByRole('alert').first()).toBeVisible();await expect(page.getByText('保存成功',{exact:true})).toHaveCount(0);expect((await snapshot(page)).error).not.toBeNull();await evidence('storage-denied',{alert:await page.getByRole('alert').first().innerText(),protectedStorage:await page.evaluate(()=>(window as any).__protectedStorage)});
});

test('mobile touch controls, no overflow, mini bar reserves last content and reduced-motion',async({browser})=>{
 const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Shanghai'});const page=await c.newPage();await ready(page,'/?date=2026-11-10&theme=dark');await page.getByTestId('timer-start').tap();await expect(page.locator('[data-testid="mini-timer"]:visible').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await page.locator('[data-theme-toggle]:visible').first().tap();expect((await snapshot(page)).sessions[0].status).toBe('running');await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(150);const spatial=await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getKeyframes().some(k=>k.transform||k.clipPath)));expect(spatial).toEqual([]);await evidence('mobile',{viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth})),snapshot:await snapshot(page)});await call(page,'end');await c.close();
});
