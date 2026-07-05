import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const base=process.env.APP_URL??'http://127.0.0.1:3000';
const output=resolve('tmp/pdfs');
await mkdir(output,{recursive:true});

const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
const page=await browser.newPage({viewport:{width:1600,height:900}});
await page.goto(base);
await page.getByLabel('ユーザー名').fill(process.env.REPORT_USER??'admin');
await page.getByLabel('パスワード').fill(process.env.REPORT_PASSWORD??'wellnot-admin');
await page.getByRole('button',{name:'ログイン'}).click();
await page.getByRole('heading',{name:'受注工事一覧'}).waitFor();

await page.getByRole('button',{name:'完了一覧'}).click();
await page.getByRole('heading',{name:'完了案件'}).waitFor();
await page.pdf({path:resolve(output,'受注工事一覧_A3横.pdf'),printBackground:true,preferCSSPageSize:true});

const firstProject=page.locator('a[data-id]').first();
if(await firstProject.count()){
  await firstProject.click();
  await page.getByRole('heading',{name:/TEST-/}).waitFor();
  await page.pdf({path:resolve(output,'工程管理票_A4横.pdf'),printBackground:true,preferCSSPageSize:true});
}

await page.getByRole('button',{name:'工程カレンダー'}).click();
await page.getByRole('heading',{name:'工程スケジュールカレンダー'}).waitFor();
await page.pdf({path:resolve(output,'工程スケジュール_A3横.pdf'),printBackground:true,preferCSSPageSize:true});
await browser.close();
console.log(output);
