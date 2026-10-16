import { test as base, expect } from 'playwright-test-coverage';

interface Violation {
  method: string;
  url: string;
  body: string | null;
}

const test = base.extend({
  page: async ({ page }, use) => {
    const violations: Violation[] = [];

    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = request.url();

      if (url.startsWith('http://localhost:3000')) {
        const violation = { method: request.method(), url, body: request.postData() };
        violations.push(violation);
        console.log(`Blocked request to http://localhost:3000 -> ${violation.method} ${violation.url} ${violation.body}`);
        await route.abort();
        return;
      }

      await route.continue();
    });

    await use(page);

    expect(violations, 'Unexpected request(s) made to http://localhost:3000').toEqual([]);
  },
});

export { test, expect };