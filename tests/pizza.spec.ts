import { Page } from '@playwright/test';
import { test, expect } from './testSetup';
import { Role, User } from '../src/service/pizzaService';

async function basicInit(page: Page) {
  let loggedInUser: User | undefined;
  const validUsers: Record<string, User> = { 'd@jwt.com': { id: '3', name: 'Kai Chen', email: 'd@jwt.com', password: 'a', roles: [{ role: Role.Diner }] } };

  await page.route('*/**/api/auth', async (route) => {
    const loginReq = route.request().postDataJSON();
    const user = validUsers[loginReq.email];
    if (!user || user.password !== loginReq.password) {
      await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
      return;
    }
    loggedInUser = validUsers[loginReq.email];
    const loginRes = {
      user: loggedInUser,
      token: 'abcdef',
    };
    expect(route.request().method()).toBe('PUT');
    await route.fulfill({ json: loginRes });
  });

  await page.route('*/**/api/user/me', async (route) => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: loggedInUser });
  });

  await page.route('*/**/api/order/menu', async (route) => {
    const menuRes = [
      { id: 1, title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' },
      { id: 2, title: 'Pepperoni', image: 'pizza2.png', price: 0.0042, description: 'Spicy treat' },
    ];
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: menuRes });
  });

  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    const franchiseRes = {
      franchises: [
        {
          id: 2,
          name: 'LotaPizza',
          stores: [
            { id: 4, name: 'Lehi' },
            { id: 5, name: 'Springville' },
            { id: 6, name: 'American Fork' },
          ],
        },
        { id: 3, name: 'PizzaCorp', stores: [{ id: 7, name: 'Spanish Fork' }] },
        { id: 4, name: 'topSpot', stores: [] },
      ],
    };
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: franchiseRes });
  });

  await page.route('*/**/api/order', async (route) => {
    const orderReq = route.request().postDataJSON();
    const orderRes = {
      order: { ...orderReq, id: 23 },
      jwt: 'eyJpYXQ',
    };
    expect(route.request().method()).toBe('POST');
    await route.fulfill({ json: orderRes });
  });

  await page.goto('/');
}

test('login', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('d@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('link', { name: 'KC' })).toBeVisible();
});

test('order with login', async ({ page }) => {
  await basicInit(page);

  await page.getByRole('button', { name: 'Order now' }).click();

  await expect(page.locator('h2')).toContainText('Awesome is a click away');
  await page.getByRole('combobox').selectOption('4');
  await page.getByRole('link', { name: 'Image Description Veggie A' }).click();
  await page.getByRole('link', { name: 'Image Description Pepperoni' }).click();
  await expect(page.locator('form')).toContainText('Selected pizzas: 2');
  await page.getByRole('button', { name: 'Checkout' }).click();

  await page.getByPlaceholder('Email address').fill('d@jwt.com');
  await page.getByPlaceholder('Password').fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('main')).toContainText('Send me those 2 pizzas right now!');
  await expect(page.locator('tbody')).toContainText('Veggie');
  await expect(page.locator('tbody')).toContainText('Pepperoni');
  await expect(page.locator('tfoot')).toContainText('0.008 ₿');
  await page.getByRole('button', { name: 'Pay now' }).click();

  await expect(page.getByText('0.008')).toBeVisible();
});


test('franchise as admin', async ({ page }) => {
  const admin = {
    id: '1',
    name: 'Admin',
    email: 'a@jwt.com',
    roles: [{ role: Role.Admin }],
  };

  let franchises = [
    {
      id: '1',
      name: 'pizzaPocket',
      admins: [{ id: '1', name: 'Admin', email: 'a@jwt.com' }],
      stores: [],
    },
  ];

  await page.route('**/api/auth', async (route) => {
    expect(route.request().method()).toBe('PUT');
    await route.fulfill({
      json: { user: admin, token: 'admin-token' },
    });
  });

  await page.route('**/api/user/me', async (route) => {
    await route.fulfill({ json: admin });
  });

  await page.route('**/api/franchise?*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: { franchises, more: false },
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/franchise', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const created = {
        id: '2',
        name: body.name,
        admins: body.admins,
        stores: [],
      };

      franchises.push(created);
      await route.fulfill({ json: created });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/franchise/*', async (route) => {
    if (route.request().method() === 'DELETE') {
      const id = route.request().url().split('/').pop();
      franchises = franchises.filter((f) => f.id !== id);
      await route.fulfill({
        json: { message: 'franchise deleted' },
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('a@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('admin');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByRole('link', { name: 'Admin' }).click();
  await expect(page.locator('tbody')).toContainText('pizzaPocket');

  await page.getByRole('button', { name: 'Add Franchise' }).click();
  await page.getByRole('textbox', { name: 'franchise name' }).fill('Orem');
  await page.getByRole('textbox', { name: 'franchisee admin email' }).fill('a@jwt.com');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('row', { name: /Orem/ })).toBeVisible();

  await page.getByRole('row', { name: /Orem/ })
    .getByRole('button')
    .click();

  await expect(page.getByRole('heading')).toContainText('Sorry to see you go');
  await page.getByRole('button', { name: 'Close' }).click();
});


test('franchise with franchisee', async ({ page }) => {
  const franchisee = {
    id: '4',
    name: 'Pizza Franchisee',
    email: 'f@jwt.com',
    roles: [{ role: Role.Franchisee, objectId: '1' }],
  };

  let stores = [
    { id: '4', name: 'SLC', totalRevenue: 0 },
  ];

  await page.route('**/api/auth', async (route) => {
    expect(route.request().method()).toBe('PUT');
    await route.fulfill({
      json: { user: franchisee, token: 'franchisee-token' },
    });
  });

  await page.route('**/api/user/me', async (route) => {
    await route.fulfill({ json: franchisee });
  });

  await page.route('**/api/franchise/4', async (route) => {
    await route.fulfill({
      json: [{
        id: '1',
        name: 'pizzaPocket',
        admins: [{ id: '4', name: 'Pizza Franchisee', email: 'f@jwt.com' }],
        stores,
      }],
    });
  });

  await page.route('**/api/franchise/1/store', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const store = {
        id: '5',
        name: body.name,
        totalRevenue: 0,
      };

      stores.push(store);
      await route.fulfill({ json: store });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/franchise/1/store/*', async (route) => {
    if (route.request().method() === 'DELETE') {
      const id = route.request().url().split('/').pop();
      stores = stores.filter((store) => store.id !== id);

      await route.fulfill({
        json: { message: 'store deleted' },
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/');

  await page.getByRole('navigation', { name: 'Global' })
    .getByRole('link', { name: 'Franchise' }).click();

  await expect(page.getByText('If you are already a')).toBeVisible();
  await expect(page.getByRole('alert'))
    .toContainText('If you are already a franchisee');

  await page.getByRole('link', { name: 'login', exact: true }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('f@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('franchisee');
  await page.getByRole('textbox', { name: 'Password' }).press('Enter');

  await expect(page.locator('tbody')).toContainText('SLC');

  await page.getByRole('button', { name: 'Create store' }).click();
  await page.getByRole('textbox', { name: 'store name' }).fill('Provo');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('row', { name: /Provo/ })).toBeVisible();

  await page.getByRole('row', { name: /Provo/ })
    .getByRole('button').click();

  await expect(page.getByRole('main'))
    .toContainText('Are you sure you want to close the pizzaPocket store Provo');

  await page.getByRole('button', { name: 'Close' }).click();
});

test('register stuff', async ({ page }) => {
  const registeredUser = {
    id: '8',
    name: 'registeree',
    email: 're@jwt.com',
    roles: [{ role: Role.Diner }],
  };

  await page.route('**/api/auth', async (route) => {
    const request = route.request();

    if (request.method() === 'POST') {
      expect(request.postDataJSON()).toMatchObject({
        name: 'registeree',
        email: 're@jwt.com',
        password: 'registeree',
      });

      await route.fulfill({
        json: { user: registeredUser, token: 'register-token' },
      });
      return;
    }

    if (request.method() === 'DELETE') {
      await route.fulfill({ json: {} });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/user/me', async (route) => {
    await route.fulfill({ json: registeredUser });
  });

  await page.goto('/');

  await page.getByRole('link', { name: 'Register' }).click();
  await page.getByRole('textbox', { name: 'Full name' }).fill('registeree');
  await page.getByRole('textbox', { name: 'Email address' }).fill('re@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('registeree');
  await page.getByRole('button', { name: 'Register' }).click();

  await expect(page.getByRole('link', { name: 'r', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Logout' }).click();

  await expect(page.getByRole('navigation', { name: 'Global' }))
    .toContainText('JWT PizzaOrderFranchiseLoginRegister');
});

test('dinerDashboard', async ({ page }) => {
  const diner = {
    id: '3',
    name: 'Pizza Diner',
    email: 'd@jwt.com',
    roles: [{ role: Role.Diner }],
  };

  await page.route('**/api/auth', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        json: { user: diner, token: 'diner-token' },
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/user/me', async (route) => {
    await route.fulfill({ json: diner });
  });

  await page.route('**/api/order', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          id: '3',
          dinerId: '3',
          orders: [],
        },
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/');

  await page.getByRole('link', { name: 'About' }).click();
  await expect(page.getByRole('main')).toContainText('The secret sauce');

  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('heading')).toContainText('Mama Rucci, my my');

  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('d@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('diner');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByRole('link', { name: 'pd' }).click();
  await expect(page.getByRole('heading')).toContainText('Your pizza kitchen');
});

test('unknown page and docs', async ({ page }) => {
  await page.goto('/');
  await page.goto('/befuao');

  await expect(page.getByRole('main')).toContainText(
    'It looks like we have dropped a pizza on the floor. Please try another page.'
  );

  await page.route('**/api/docs', async (route) => {
    await route.fulfill({
      json: {
        version: 'test',
        endpoints: [
          {
            method: 'POST',
            path: '/api/auth',
            description: 'Register a user',
            example:
              `curl -X POST localhost:3000/api/auth -d '{"name":"pizza diner", "email":"d@jwt.com", "password":"diner"}' -H 'Content-Type: application/json'`,
          },
        ],
        config: {
          factory: { url: 'http://localhost:3001' },
          db: { connection: { host: 'localhost' } },
        },
      },
    });
  });

  await page.goto('/docs');

  await expect(page.getByRole('main')).toContainText('JWT Pizza API');
  await expect(page.getByRole('heading', { name: '[POST] /api/auth' })).toBeVisible();

  await page.getByRole('heading', { name: '[POST] /api/auth' }).click();

  await expect(page.getByText('Example request').first()).toBeVisible();

  await expect(page.getByRole('main')).toContainText(
    `curl -X POST localhost:3000/api/auth -d '{"name":"pizza diner", "email":"d@jwt.com", "password":"diner"}' -H 'Content-Type: application/json'`
  );
});

test('more docs and dashboard', async ({ page }) => {
  const diner = {
    id: '3',
    name: 'Pizza Diner',
    email: 'd@jwt.com',
    roles: [{ role: Role.Diner }],
  };

  await page.route('**/api/docs', async (route) => {
    await route.fulfill({
      json: {
        version: 'test',
        endpoints: [
          {
            method: 'DELETE',
            path: '/api/franchise/:franchiseId/store/:storeId',
            description: 'Close a store',
            requiresAuth: true,
            example:
              "curl -X DELETE localhost:3000/api/franchise/1/store/1 -H 'Authorization: Bearer tttttt'",
          },
        ],
        config: {
          factory: { url: 'http://localhost:3001' },
          db: { connection: { host: 'localhost' } },
        },
      },
    });
  });

  await page.route('**/api/auth', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        json: { user: diner, token: 'diner-token' },
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/user/me', async (route) => {
    await route.fulfill({ json: diner });
  });

  await page.route('**/api/order', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          orders: [
            {
              id: '1',
              items: [{ price: 0.004 }],
              date: '2026-10-16T12:00:00.000Z',
            },
          ],
        },
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await page.goto('/docs');

  await expect(page.getByRole('main')).toContainText(
    '[DELETE] /api/franchise/:franchiseId/store/:storeId'
  );
  await expect(page.getByRole('main')).toContainText(
    "curl -X DELETE localhost:3000/api/franchise/1/store/1 -H 'Authorization: Bearer tttttt'"
  );

  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('d@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('diner');
  await page.getByRole('textbox', { name: 'Password' }).press('Enter');

  await page.getByRole('link', { name: 'pd' }).click();
  await expect(page.locator('thead')).toContainText('Date');
  await page.getByRole('img', { name: 'Employee stock photo' }).click();
});


test('verify valid and invalid JWT', async ({ page }) => {
  await page.route('**/api/order/verify', async (route) => {
    const body = route.request().postDataJSON();

    if (body.jwt === 'valid-token') {
      await route.fulfill({
        json: {
          message: 'valid',
          payload: { id: '3' },
        },
      });
    } else {
      await route.fulfill({
        status: 401,
        json: { message: 'invalid JWT' },
      });
    }
  });

  await page.goto('/');

  await page.evaluate(() => {
    window.history.replaceState(
      {
        usr: {
          order: { id: '1', items: [] },
          jwt: 'valid-token',
        },
        key: 'test-key',
        idx: 0,
      },
      '',
      '/delivery'
    );
  });

  await page.reload();

  await expect(
    page.getByRole('heading', { name: 'Here is your JWT Pizza!' })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Verify' }).click();

  await expect(
    page.getByRole('heading', { name: /JWT Pizza - valid/ })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Close' }).click();

  await page.evaluate(() => {
    window.history.replaceState(
      {
        usr: {
          order: { id: '1', items: [] },
          jwt: 'invalid-token',
        },
        key: 'test-key',
        idx: 0,
      },
      '',
      '/delivery'
    );
  });

  await page.reload();

  await page.getByRole('button', { name: 'Verify' }).click();

  await expect(
    page.getByRole('heading', { name: /JWT Pizza - invalid/ })
  ).toBeVisible();
});
