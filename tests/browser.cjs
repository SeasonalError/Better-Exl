/* Optional end-to-end checks: npm install --no-save playwright; npx playwright install chromium.
   Run: node tests/browser.cjs. CHROMIUM_PATH may point to an installed browser. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'better-exl-qa-'));
const python=process.env.BETTER_EXL_PYTHON||path.join(root,process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
const server=spawn(python,['run.py','--no-browser','--port','8766','--data-dir',temp],{cwd:root,stdio:['ignore','pipe','pipe']});let logs='';server.stderr.on('data',x=>logs+=x);server.stdout.on('data',x=>logs+=x);
let browser;const errors=[];let checks=0;const check=(condition,message)=>{assert.ok(condition,message);checks++;};
(async()=>{try{
 for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:8766/api/config');if(r.ok)break;}catch{}if(i===99)throw Error('Server unavailable: '+logs);await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:1080},acceptDownloads:true});await context.grantPermissions(['clipboard-read','clipboard-write']);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const click=async(action)=>page.locator(`[data-action="${action}"]:visible`).first().click();const state=()=>page.evaluate(()=>({p:S.p,a:S.a,tab:S.tab}));
 await page.goto('http://127.0.0.1:8766/');await page.waitForSelector('.intro');check(await page.title()==='Better Exl · Your lab workspace','Overview loads');
 await page.screenshot({path:path.join(root,'artifacts/overview.png'),fullPage:true});
 await click('demo');await page.waitForFunction(()=>S.a?.fit&&document.querySelector('#graph')?.data?.length>2);
 let r=await state();check(Math.abs(r.a.fit.params[0].value-4.038433624)<1e-5,'Demo correct');check(r.a.theory.predicted.length===10,'Independent theory');
 await page.screenshot({path:path.join(root,'artifacts/workspace.png'),fullPage:true});
 await page.locator('#graph .gtitle').dblclick();await page.locator('#graph-text').fill('A graph I can edit');await click('graph-text');await page.waitForFunction(()=>document.querySelector('#graph .gtitle')?.textContent==='A graph I can edit');check((await state()).p.sheets[0].plot.title==='A graph I can edit','Graph double click');
 await page.locator('[data-cell="0:1:value"]').fill('9.1');await page.locator('[data-cell="1:1:value"]').focus();await page.waitForFunction(()=>S.a?.values.t[0]===9.1);check((await state()).a.values.T[0]===.91,'Derived column recalculation');
 await click('undo');await page.waitForFunction(()=>S.a?.values.t[0]!==9.1);check((await state()).a.values.t[0]!==9.1,'Undo recalculates');
 await page.locator('[data-column="T2"]').click();await click('budget');check((await page.locator('#modal').innerText()).includes('Sensitivity × u'),'Uncertainty budget');await click('close');
 await click('annotation');await page.locator('#annotation-text').fill('Timing uncertainty included');await click('add-annotation');check((await state()).p.sheets[0].plot.annotations.length===1,'Graph annotation');
 await page.locator('[data-action="tab"][data-id="fit"]').click();await page.waitForSelector('#residual .main-svg');check((await page.locator('#analysis-summary').innerText()).includes('Theory versus measurement'),'Fit results and residuals');
 await page.screenshot({path:path.join(root,'artifacts/fit.png'),fullPage:true});
 await page.locator('[data-action="tab"][data-id="stats"]').click();await page.waitForSelector('#stats-content table');await click('repeats');await click('preview-repeats');check(await page.locator('#repeat-preview tbody tr').count()===10,'Repeated trials preview');await click('close');
 await page.locator('[data-action="tab"][data-id="notes"]').click();await page.locator('#note-notes').fill('QA observation');await page.locator('#note-objective').focus();await page.waitForFunction(()=>!S.dirty&&!S.saving);await click('history');check(await page.locator('[data-action="restore"]').count()>1,'Immutable revisions');await click('close');
 const saved=(await state()).p;await page.reload();await page.waitForSelector('.intro');await page.locator(`.card[data-action="open"][data-id="${saved.id}"]`).click();await page.waitForFunction(()=>S.a?.fit);check((await state()).p.notes==='QA observation','Persistence after reload');
 await click('export');const event=page.waitForEvent('download');await page.locator('[data-action="download"][data-id="bundle"]').click();const download=await event;check(download.suggestedFilename()==='better-exl-analysis.zip','Bundle downloaded');await click('close');
 const svgEvent=page.waitForEvent('download');await click('svg');const svg=await svgEvent;await svg.saveAs(path.join(root,'artifacts/figure.svg'));check(fs.readFileSync(path.join(root,'artifacts/figure.svg'),'utf8').includes('<svg'),'SVG download');
 await page.locator('#file-picker').setInputFiles({name:'measurements.csv',mimeType:'text/csv',buffer:Buffer.from('Time [s],Position [m]\n0,1\n1,3.1\n2,4.9\n3,7.1\n4,8.9\n')});await page.waitForSelector('#import-header');await click('preview-import');check(await page.locator('#import-preview tbody tr').count()===5,'Import preview');await click('import-project');await page.waitForFunction(()=>S.a?.values.Time?.length===5);check((await state()).p.sheets[0].columns[0].unit==='s','Import units');
 await page.locator('[data-action="tab"][data-id="fit"]').click();await click('run-fit');await page.waitForFunction(()=>S.a?.fit);check(Math.abs((await state()).a.fit.params[0].value-1.98)<1e-4,'Imported-data fit');
 await page.locator('[data-action="tab"][data-id="stats"]').click();await click('signals');await page.locator('#signal-operation').selectOption('derivative');await click('preview-signal');await page.waitForSelector('#signal-preview .main-svg');check((await page.locator('#signal-note').innerText()).includes('uncertainty is not estimated'),'Signal uncertainty honest');await click('save-signal');await page.waitForFunction(()=>S.p.sheets.length===2);check((await state()).p.sheets[1].rows.length===5,'Signal output separate dataset');
 await page.locator('[data-action="tab"][data-id="data"]').click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'artifacts/mobile.png'),fullPage:true});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile layout contains page');
 await page.setViewportSize({width:1440,height:1080});await click('new');await page.locator('#new-name').fill('Paste trial');await click('create');await click('paste');await page.locator('#paste-table').fill('1\t2\n2\t4\n3\t6\n4\t8');await click('apply-paste');await page.waitForFunction(()=>S.a?.values.x?.length===4);check((await state()).p.sheets[0].rows.length===4,'Excel range paste');
 await click('add-column');await page.locator('#col-name').fill('Ratio');await page.locator('#col-key').fill('ratio');await page.locator('#col-formula').fill('y/x');await click('save-column');await page.waitForFunction(()=>S.a?.values.ratio?.[0]===2);check((await state()).a.values.ratio.every(v=>v===2),'Formula editor');
 check(errors.length===0,'No browser errors: '+errors.join('\n'));console.log(JSON.stringify({checks,browserErrors:errors,status:'PASS',screenshots:'artifacts/'},null,2));
}finally{if(browser)await browser.close();server.kill();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);console.error(logs.slice(-1500));process.exitCode=1;});
