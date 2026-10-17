import request from 'supertest';
import { app, createProduct, prisma, resetDb } from './helpers';

beforeAll(resetDb);
afterAll(() => prisma.$disconnect());

it('خريطة الموقع تضم الصفحات العامة والمنتجات المعتمدة فقط', async () => {
  const shown = await createProduct({ name: 'كرسي حديقة' });
  const hidden = await createProduct({ name: 'مخفي', visible: false });
  const res = await request(app).get('/sitemap.xml');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('application/xml');
  expect(res.text).toContain('<loc>http://localhost:5173/store</loc>');
  expect(res.text).toContain(`/store/${shown.slug}</loc>`);
  expect(res.text).not.toContain(hidden.slug);
});

it('خريطة المنتجات بدون الصفحات الثابتة', async () => {
  const res = await request(app).get('/sitemap-products.xml');
  expect(res.status).toBe(200);
  expect(res.text).toContain('<urlset');
  expect(res.text).not.toContain('<loc>http://localhost:5173/store</loc>');
});
