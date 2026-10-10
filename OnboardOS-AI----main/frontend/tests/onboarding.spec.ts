import { test, expect, type Page } from '@playwright/test'

const row = (page: Page, title: string) => page.locator('.candidate-detail .task-row').filter({has:page.getByText(title,{exact:true})})
async function confirm(page: Page, name: string) {
  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()
  await modal.getByRole('button',{name,exact:true}).click()
  await expect(modal).toBeHidden()
}
async function switchRole(page: Page, name: string) {await page.getByRole('button',{name,exact:true}).click()}

test('complete real three-role onboarding loop in the browser', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('heading',{name:'入职协同，井然有序。'})).toBeVisible()
  await expect(page.locator('.person-button').filter({hasText:'张晨'})).toBeVisible()
  await page.screenshot({path:'../docs/hr-dashboard.png',fullPage:false})
  await page.getByRole('button',{name:'创建候选人',exact:true}).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('姓名',{exact:true}).fill('验收模拟王晓')
  await modal.getByLabel('岗位名称').fill('技术总监')
  await modal.getByLabel('岗位类别').selectOption('executive')
  await modal.getByLabel('用工模式').selectOption('dispatch')
  await modal.getByLabel('所属部门').fill('产品创新部')
  await modal.getByRole('button',{name:'保存候选人'}).click()
  await expect(modal).toBeHidden()
  await page.getByRole('button',{name:'发送 Offer / 启动入职流程'}).click()
  await expect(page.locator('.candidate-detail')).toContainText('派遣用工协议')
  await expect(row(page,'最终入职确认')).toContainText('已阻塞')

  await switchRole(page,'候选人')
  await expect(page.getByRole('heading',{name:'你好，验收模拟王晓。'})).toBeVisible()
  await row(page,'Offer 确认').getByRole('button',{name:'确认 Offer'}).click()
  await confirm(page,'确认执行')
  await page.getByRole('button',{name:'我还有什么材料没交？',exact:true}).click()
  await expect(page.locator('.assistant-message')).toContainText('三方协议')
  await expect(page.locator('.run-details')).toContainText('4 次真实工具执行')
  for (const title of ['基础材料','三方协议','派遣用工协议']) {
    await row(page,title).getByRole('button',{name:'提交模拟材料'}).click()
    await confirm(page,'确认提交')
    await expect(row(page,title)).toContainText('待审核')
  }
  await page.reload()
  await switchRole(page,'候选人')
  await page.getByLabel('选择候选人').selectOption({label:'验收模拟王晓 · 技术总监'})
  await expect(row(page,'三方协议')).toContainText('待审核')
  await page.screenshot({path:'../docs/candidate-workbench.png',fullPage:false})

  await switchRole(page,'企业 HR')
  for (const title of ['基础材料','三方协议','派遣用工协议']) {
    await row(page,title).getByRole('button',{name:'审核通过'}).click()
    await confirm(page,'确认执行')
    await expect(row(page,title)).toContainText('已完成')
  }
  await row(page,'材料汇总审核').getByRole('button',{name:'确认材料完整'}).click()
  await confirm(page,'确认执行')
  await switchRole(page,'上海外服')
  for (const title of ['背景调查','体检服务协调']) {
    const service = page.locator('.service-item').filter({has:page.getByText(`验收模拟王晓 · ${title}`,{exact:true})})
    await service.getByRole('button',{name:'接收任务'}).click()
    await confirm(page,'确认执行')
    if(title === '背景调查') {
      await service.getByRole('button',{name:'更新进度'}).click()
      await page.getByRole('dialog').getByLabel('服务进度（必填）').fill('模拟协调已完成 80%')
      await confirm(page,'确认执行')
    }
    await service.getByRole('button',{name:'提交模拟结果'}).click()
    await confirm(page,'确认执行')
    await expect(service).toContainText('待审核')
  }
  await page.screenshot({path:'../docs/external-workbench.png',fullPage:false})
  await switchRole(page,'企业 HR')
  await expect(row(page,'最终入职确认')).toContainText('已阻塞')
  for(const title of ['背景调查','体检服务协调']) {
    await row(page,title).getByRole('button',{name:'审核通过'}).click()
    await confirm(page,'确认执行')
  }
  await row(page,'最终入职确认').getByRole('button',{name:'确认正式入职'}).click()
  await confirm(page,'确认执行')
  await expect(page.locator('.candidate-detail .journey-progress')).toContainText('100%')
  await expect(page.locator('.candidates-panel tr').filter({hasText:'验收模拟王晓'})).toContainText('已入职')
  await page.getByRole('button',{name:'检查下周入职延期风险并给出督办建议',exact:true}).click()
  await expect(page.locator('.assistant-message')).toContainText('督办建议')
  await page.getByRole('button',{name:'督办与消息',exact:true}).click()
  await page.locator('.proposal-card').filter({hasText:'张晨'}).getByRole('button',{name:'确认督办'}).click()
  await confirm(page,'确认执行')
  await switchRole(page,'候选人')
  await page.getByLabel('选择候选人').selectOption({label:'张晨 · 前端开发工程师'})
  await page.getByRole('button',{name:'督办与消息',exact:true}).click()
  await expect(page.locator('.message-card')).toContainText('三方协议')
  expect(errors).toEqual([])
})

test('responsive layout and seeded workflow differences',async ({page}) => {
  await page.goto('/')
  await expect(page.locator('.candidate-detail')).toContainText('三方协议')
  await page.getByRole('button',{name:/刘静.*业务发展总监/}).click()
  await expect(page.locator('.candidate-detail')).toContainText('背景调查')
  await expect(page.locator('.candidate-detail')).toContainText('派遣用工协议')
  await expect(page.locator('.candidate-detail')).not.toContainText('三方协议')
  await page.getByRole('button',{name:'动态流程引擎',exact:true}).click()
  await expect(page.getByRole('heading',{name:'角色驱动动态流程引擎'})).toBeVisible()
  await page.setViewportSize({width:390,height:844})
  await switchRole(page,'候选人')
  await expect(page.locator('.candidate-hero')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({path:'../docs/mobile-workbench.png',fullPage:false})
})
