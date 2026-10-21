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

it('رابط الترويج يعطي فيسبوك صورة المنتج واسمه وسعره ويحوّل الزائر لصفحة المنتج', async () => {
  const p = await createProduct({ name: 'طاولة "خشب" & زجاج' });
  await prisma.productMedia.create({ data: { productId: p.id, url: 'https://res.cloudinary.com/demo/image/upload/v1/farjar/t.jpg' } });
  // الزائر العادي يُحوَّل فورًا لصفحة المنتج
  const human = await request(app).get(`/share/p/${p.slug}`).set('User-Agent', 'Mozilla/5.0 (iPhone)');
  expect(human.status).toBe(302);
  expect(human.headers.location).toBe(`http://localhost:5173/store/${p.slug}`);
  // فيسبوك يأخذ بيانات المنتج نفسه بلا أي تحويل
  const res = await request(app).get(`/share/p/${p.slug}`).set('User-Agent', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)');
  expect(res.text).not.toContain('http-equiv="refresh"');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('text/html');
  expect(res.text).toContain('<meta property="og:image" content="https://res.cloudinary.com/demo/image/upload/c_pad,b_white,w_1200,h_630,f_jpg,q_auto/v1/farjar/t.jpg">');
  expect(res.text).toContain('طاولة &quot;خشب&quot; &amp; زجاج');
  expect(res.text).toContain('د.أ');
  expect(res.text).toContain(`<meta property="og:url" content="http://localhost:5173/p/${p.slug}">`);

  const hidden = await createProduct({ name: 'مخفي2', visible: false });
  const gone = await request(app).get(`/share/p/${hidden.slug}`).set('User-Agent', 'facebookexternalhit/1.1');
  expect(gone.status).toBe(302);
  expect(gone.headers.location).toBe('http://localhost:5173/store');
});
