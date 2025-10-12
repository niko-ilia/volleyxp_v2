const request = require('supertest');
const app = require('../server');

describe('/api/ping', () => {
  it('should return 200 and { message: "pong" }', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ message: 'pong' });
  });
}); 