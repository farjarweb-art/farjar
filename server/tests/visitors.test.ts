import request from 'supertest';
import { app, prisma } from './helpers';

const origin = { Origin: 'http://localhost:5173' };

beforeAll(() => prisma.counter.deleteMany());
afterAll(() => prisma.$disconnect());

it('عدد الزوار يبدأ من 666 ويزيد مع كل زيارة', async () => {
  expect((await request(app).get('/api/v1/site/visitors')).body.data.count).toBe(665);
  const first = await request(app).post('/api/v1/site/visit').set(origin);
  expect(first.status).toBe(200);
  expect(first.body.data.count).toBe(666);
  expect((await request(app).post('/api/v1/site/visit').set(origin)).body.data.count).toBe(667);
  expect((await request(app).get('/api/v1/site/visitors')).body.data.count).toBe(667);
});
