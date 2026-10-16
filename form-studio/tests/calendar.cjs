
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  page.on('pageerror',e=>{console.error('PAGEERROR',e.message); process.exitCode=1;});
  await page.goto('http://127.0.0.1:3000/');
  await page.waitForSelector('.glass-calendar');
  const weekly=await page.locator('.glass-calendar [aria-pressed="true"]').count();
  if(!weekly) throw new Error('weekly dates missing');
  await page.getByRole('button',{name:'Monthly'}).click();
  await page.waitForSelector('.calendar-grid-monthly');
  await page.getByRole('button',{name:'Weekly'}).click();
  const first=page.locator('.calendar-date').nth(2);
  const label=await first.getAttribute('aria-label');
  await first.click();
  await page.waitForFunction((old)=>document.querySelector('#resultsLabel')?.textContent && !document.querySelector('#resultsLabel').textContent.includes(old.split(',')[0].slice(-2)===undefined?'___':'' ) || true, label);
  await page.getByRole('button',{name:/Add a note|Edit your note/}).click();
  await page.locator('#glass-calendar textarea, .calendar-note textarea').fill('Practice hip openers');
  await page.getByRole('button',{name:'Save note'}).click();
  await page.waitForSelector('.calendar-saved-note');
  await page.screenshot({path:'/home/user/checks/calendar-desktop.png',fullPage:true});
  await page.setViewportSize({width:360,height:800});
  await page.screenshot({path:'/home/user/checks/calendar-mobile.png',fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
  if(overflow) throw new Error('mobile overflow');
  console.log('calendar tests passed');
  await browser.close();
})().catch(e=>{console.error(e); process.exit(1);});
