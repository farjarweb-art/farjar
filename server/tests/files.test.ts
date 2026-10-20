import { cloudinaryRawId } from '../src/routes/public/files';

describe('فتح ملفات PDF من Cloudinary', () => {
  it('يقبل روابط raw لحسابنا ومجلدنا فقط', () => {
    expect(cloudinaryRawId('https://res.cloudinary.com/demo/raw/upload/v1792505344/verjar/quotes/a1.pdf', 'demo', 'verjar')).toBe('verjar/quotes/a1.pdf');
    expect(cloudinaryRawId('https://res.cloudinary.com/demo/raw/upload/verjar/services/documents/x.dwg', 'demo', 'verjar')).toBe('verjar/services/documents/x.dwg');
    expect(cloudinaryRawId('https://res.cloudinary.com/other/raw/upload/v1/verjar/a.pdf', 'demo', 'verjar')).toBeNull();
    expect(cloudinaryRawId('https://res.cloudinary.com/demo/image/upload/v1/verjar/a.jpg', 'demo', 'verjar')).toBeNull();
    expect(cloudinaryRawId('https://res.cloudinary.com/demo/raw/upload/v1/secret/a.pdf', 'demo', 'verjar')).toBeNull();
    expect(cloudinaryRawId('https://evil.com/demo/raw/upload/v1/verjar/a.pdf', 'demo', 'verjar')).toBeNull();
    expect(cloudinaryRawId('http://res.cloudinary.com/demo/raw/upload/v1/verjar/a.pdf', 'demo', 'verjar')).toBeNull();
    expect(cloudinaryRawId('not a url', 'demo', 'verjar')).toBeNull();
  });
});
