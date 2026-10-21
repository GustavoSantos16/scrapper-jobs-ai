import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('manual capture end to end: empty state → capture with progress → real results', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Nenhuma vaga no acervo ainda')).toBeVisible();

  await page.getByRole('button', { name: 'Capturar agora' }).click();
  const panel = page.getByRole('dialog', { name: 'Progresso da captura' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Sucesso')).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByText(/vagas encontradas/)).toContainText('9 vagas encontradas');
  await panel.getByRole('button', { name: 'Fechar' }).click();

  // dashboard refreshes with the captured data
  await expect(page.getByText('Vagas no acervo')).toBeVisible();
  await page.getByRole('link', { name: /Fontes/ }).first().click();
  await expect(page.getByText('Funcionando').first()).toBeVisible();
  await expect(page.getByText('Link manual').first()).toBeVisible();

  await page.goto('/capturas');
  await expect(page.getByRole('cell', { name: 'Manual' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('search, open a job, track it and find it again after reload', async ({ page }) => {
  await page.goto('/vagas');
  await page.getByRole('searchbox', { name: 'Texto da busca' }).fill('react');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/q=react/);
  const first = page.locator('article').first();
  await expect(first).toBeVisible();
  const title = (await first.locator('a').first().textContent())!.trim();

  await first.locator('a').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  // the original link opens elsewhere and never changes the application state
  await expect(page.getByRole('link', { name: 'Abrir vaga original' })).toHaveAttribute('target', '_blank');
  await expect(page.getByLabel('Estado')).toHaveValue('new');

  await page.getByRole('button', { name: 'Adicionar aos favoritos' }).first().click();
  await expect(page.getByRole('button', { name: 'Remover dos favoritos' }).first()).toBeVisible();
  await page.getByLabel('Estado').selectOption('applied');
  await page.getByLabel('Notas').fill('Candidatura enviada pelo site da empresa');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText(/Histórico \(\d+\)/)).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Estado')).toHaveValue('applied');
  await expect(page.getByLabel('Notas')).toHaveValue('Candidatura enviada pelo site da empresa');

  await page.goto('/favoritas');
  await expect(page.locator('article a').first()).toHaveText(title);
  await page.goto('/candidaturas?state=applied');
  await expect(page.locator('article a').first()).toHaveText(title);

  const csv = await page.request.get('/api/export?format=csv&favorite=true');
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain(title.replace(/"/g, '""'));
});

test('delete a job: the modal asks first, cancel keeps it, confirm removes it', async ({ page }) => {
  await page.goto('/vagas');
  const cards = page.locator('article');
  const before = await cards.count();
  expect(before).toBeGreaterThan(2);
  const title = (await cards.first().locator('a').first().textContent())!.trim();

  // from the list: cancel keeps the job
  await cards.first().getByRole('button', { name: /Excluir vaga/ }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByText('Excluir esta vaga?')).toBeVisible();
  await expect(modal.getByText(title)).toBeVisible();
  await modal.getByRole('button', { name: 'Cancelar' }).click();
  await expect(modal).toBeHidden();
  await expect(cards).toHaveCount(before);

  // confirm removes it
  await cards.first().getByRole('button', { name: /Excluir vaga/ }).click();
  await modal.getByRole('button', { name: 'Excluir vaga' }).click();
  await expect(cards).toHaveCount(before - 1);
  await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0);

  // from the detail page: deleting goes back to the list
  const second = (await cards.first().locator('a').first().textContent())!.trim();
  await cards.first().locator('a').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(second);
  await page.getByRole('button', { name: /Excluir vaga/ }).click();
  await modal.getByRole('button', { name: 'Excluir vaga' }).click();
  await expect(page).toHaveURL(/\/vagas$/);
  await expect(cards).toHaveCount(before - 2);
});
