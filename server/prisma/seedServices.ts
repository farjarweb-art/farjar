/**
 * كتالوج الخدمات والمعاينات الأولي (يُنشأ مرة واحدة فقط عندما يكون فارغًا — بعدها كل شيء من لوحة التحكم).
 * الأسعار مبدئية يعدّلها المدير.
 */
import { seedInspectionV2, seedInspectionV3 } from './seedInspection';
import { Prisma, type PrismaClient, type ServiceAudience, type ServiceRequestType } from '@prisma/client';

const D = (n: number) => new Prisma.Decimal(n);

const INSPECT: ServiceRequestType[] = ['INSPECTION', 'INSPECTION_REPORT', 'DIAGNOSIS', 'REPAIR_QUOTE'];
const HOME: ServiceAudience[] = ['HOME'];
const BIZ: ServiceAudience[] = ['BUSINESS'];
const BOTH: ServiceAudience[] = ['HOME', 'BUSINESS'];

type SeedService = {
  slug: string;
  name: string;
  summary: string;
  includes: string;
  audiences: ServiceAudience[];
  requestTypes?: ServiceRequestType[];
  inside: number;
  outside: number;
  minutes?: number;
  policy?: 'DEDUCTIBLE' | 'SEPARATE';
  featured?: boolean;
};

export const WATER_SLUG = 'water-leaks-moisture';

const SERVICES: SeedService[] = [
  {
    slug: WATER_SLUG,
    name: 'كشف تسربات المياه والرطوبة وفحص شبكات المياه والصرف الصحي',
    summary: 'اختر المشكلة التي تواجهها، وأضف الأجهزة المناسبة لحالتك ضمن زيارة واحدة بسعر ثابت.',
    includes: [
      'فحص آثار الرطوبة والتسرب الظاهرة',
      'معاينة المناطق المشتبه بوجود تسرب فيها',
      'فحص خطوط المياه الظاهرة',
      'تقييم مؤشرات تجمع المياه أو تسربها',
      'تحديد الفحوصات الإضافية المناسبة',
      'توثيق الملاحظات والتوصيات الفنية',
    ].join('\n'),
    audiences: BOTH,
    requestTypes: [...INSPECT, 'REPAIR'],
    inside: 20,
    outside: 30,
    minutes: 90,
    policy: 'DEDUCTIBLE',
    featured: true,
  },
  { slug: 'cracks-inspection', name: 'فحص التشققات والشروخ في الجدران والأسقف', summary: 'تحديد نوع التشققات وأسبابها المحتملة وخطورتها.', includes: 'معاينة التشققات وقياس امتدادها الظاهر\nتقييم الأسباب المحتملة\nتوصيات المعالجة', audiences: HOME, inside: 15, outside: 25 },
  { slug: 'general-property-inspection', name: 'الفحص الفني العام للعقار', summary: 'جولة فنية شاملة على حالة العقار.', includes: 'فحص الجدران والأسقف والأرضيات\nفحص التمديدات الظاهرة\nملاحظات وتوصيات', audiences: HOME, inside: 25, outside: 35, minutes: 120 },
  { slug: 'paint-finishing-inspection', name: 'فحص أعمال الدهان والتشطيبات', summary: 'تقييم جودة الدهان والتشطيبات والعيوب الظاهرة.', includes: 'فحص الدهان والقصارة والبلاط\nتوثيق العيوب', audiences: HOME, inside: 15, outside: 25 },
  { slug: 'pre-purchase-inspection', name: 'فحص العقار قبل الشراء أو الاستئجار مع تقرير فني', summary: 'اعرف حالة العقار قبل أن تقرر — مع تقرير فني مكتوب.', includes: 'فحص فني عام للعقار\nفحص التمديدات والرطوبة الظاهرة\nتقرير فني بالملاحظات والتوصيات', audiences: HOME, requestTypes: ['INSPECTION_REPORT'], inside: 35, outside: 50, minutes: 150 },
  { slug: 'electrical-inspection', name: 'فحص التمديدات الكهربائية', summary: 'فحص اللوحات والتمديدات والقواطع الظاهرة.', includes: 'فحص لوحة الكهرباء والقواطع\nفحص المقابس والتمديدات الظاهرة', audiences: HOME, inside: 15, outside: 25 },
  { slug: 'roof-waterproofing-inspection', name: 'فحص الأسطح والعزل المائي ومشكلات مياه الأمطار', summary: 'فحص حالة السطح والعزل وتصريف مياه الأمطار.', includes: 'فحص طبقة العزل الظاهرة\nفحص المصارف والميول\nتوصيات المعالجة', audiences: BOTH, inside: 20, outside: 30 },
  { slug: 'tanks-wells-inspection', name: 'فحص الخزانات والآبار', summary: 'فحص الخزانات والآبار عند توفر الخدمة في منطقتك.', includes: 'فحص الحالة الظاهرة للخزان أو البئر\nملاحظات وتوصيات', audiences: HOME, inside: 20, outside: 30 },
  { slug: 'hvac-inspection', name: 'فحص أنظمة التكييف والتهوية', summary: 'فحص أداء وحدات التكييف والتهوية.', includes: 'فحص الوحدات الظاهرة\nتقييم الأداء والتهوية', audiences: HOME, inside: 15, outside: 25 },
  { slug: 'repair-after-inspection', name: 'الإصلاح والمعالجة والصيانة بعد المعاينة', summary: 'تنفيذ أعمال الإصلاح بعد المعاينة والموافقة على عرض السعر.', includes: 'زيارة لتحديد نطاق العمل\nعرض سعر منفصل للإصلاح', audiences: BOTH, requestTypes: ['REPAIR_QUOTE', 'REPAIR'], inside: 15, outside: 25, policy: 'DEDUCTIBLE' },
  { slug: 'industrial-buildings-inspection', name: 'فحص المباني والمنشآت الصناعية', summary: 'فحص فني للمباني الصناعية والمستودعات والورش.', includes: 'فحص الهيكل والجدران والأسقف الظاهرة\nملاحظات وتوصيات', audiences: BIZ, inside: 40, outside: 60, minutes: 180 },
  { slug: 'industrial-electrical-inspection', name: 'فحص التمديدات والأنظمة الكهربائية الصناعية', summary: 'فحص اللوحات والأنظمة الكهربائية في المنشأة.', includes: 'فحص اللوحات الرئيسية والفرعية\nفحص التمديدات الظاهرة', audiences: BIZ, inside: 40, outside: 60, minutes: 150 },
  { slug: 'machines-lines-inspection', name: 'فحص الماكينات وخطوط الإنتاج', summary: 'فحص فني للماكينات وخطوط الإنتاج.', includes: 'فحص الحالة التشغيلية الظاهرة\nملاحظات وتوصيات الصيانة', audiences: BIZ, inside: 45, outside: 65, minutes: 180 },
  { slug: 'industrial-floors-inspection', name: 'فحص الأرضيات الصناعية وأرضيات الإيبوكسي', summary: 'تقييم حالة الأرضيات الصناعية وطبقات الإيبوكسي.', includes: 'فحص التشققات والتقشر والهبوط\nتوصيات المعالجة', audiences: BIZ, inside: 30, outside: 45 },
  { slug: 'metalwork-inspection', name: 'فحص الأعمال المعدنية والأبواب والحمايات', summary: 'فحص الأبواب والحمايات والهياكل المعدنية.', includes: 'فحص الصدأ واللحامات والتثبيت\nتوصيات الصيانة', audiences: BIZ, inside: 25, outside: 40 },
  { slug: 'hvac-pumps-inspection', name: 'فحص أنظمة التكييف والمضخات', summary: 'فحص أنظمة التكييف والمضخات في المنشأة.', includes: 'فحص الوحدات والمضخات الظاهرة\nتقييم الأداء', audiences: BIZ, inside: 35, outside: 50 },
  { slug: 'preventive-maintenance', name: 'الصيانة الوقائية للمنشآت والمعدات وعقود الصيانة الدورية', summary: 'زيارات صيانة وقائية، أو عقد صيانة دوري/سنوي للمنشأة.', includes: 'زيارة تقييم للمنشأة\nخطة صيانة وقائية وعرض سعر', audiences: BIZ, requestTypes: ['PREVENTIVE', 'CONTRACT', 'REPAIR_QUOTE'], inside: 40, outside: 60, policy: 'DEDUCTIBLE' },
];

const DEVICES = [
  { key: 'acoustic', name: 'جهاز الكشف الصوتي عن تسربات المياه', description: 'يساعد في تحديد مواقع التسربات المحتملة داخل الأنابيب باستخدام المؤشرات الصوتية.', fee: 15 },
  { key: 'thermal', name: 'جهاز الفحص الحراري', description: 'يساعد في تحديد الفروقات الحرارية التي قد تشير إلى مناطق رطوبة أو تسرب محتمل.', fee: 15 },
  { key: 'pressure', name: 'جهاز فحص ضغط المياه', description: 'لفحص ضغط الشبكة والمساعدة في تقييم وجود خلل أو تسرب وفق ظروف الفحص.', fee: 10 },
  { key: 'camera', name: 'جهاز تنظير الصرف الصحي بالكاميرا', description: 'لفحص داخل أنابيب الصرف الصحي وتحديد الانسدادات أو التلف الظاهر داخل الأنابيب التي يمكن الوصول إليها.', fee: 25 },
] as const;

type DeviceKey = (typeof DEVICES)[number]['key'];

const WATER_PROBLEMS: [string, DeviceKey[], boolean?][] = [
  ['رطوبة الجدران أو الأسقف', ['thermal', 'acoustic']],
  ['تسرب مياه داخل الجدران أو الأرضيات', ['acoustic', 'thermal']],
  ['تسرب من شبكة المياه', ['acoustic', 'pressure']],
  ['انخفاض أو خلل في ضغط المياه', ['pressure']],
  ['تسرب أو تجمع مياه على الأسطح', ['thermal']],
  ['انسداد أو مشكلة في شبكة الصرف الصحي', ['camera']],
  ['اشتباه بتلف أو كسر في أحد الأنابيب', ['acoustic', 'pressure', 'camera']],
  ['مشكلة أخرى أصفها بنفسي', [], true],
];

const ZONES: [string, 'INSIDE_AMMAN' | 'OUTSIDE_AMMAN', number, boolean?][] = [
  ['عمّان', 'INSIDE_AMMAN', 0],
  ['الزرقاء', 'OUTSIDE_AMMAN', 0],
  ['البلقاء (السلط)', 'OUTSIDE_AMMAN', 0],
  ['مأدبا', 'OUTSIDE_AMMAN', 0],
  ['إربد', 'OUTSIDE_AMMAN', 5],
  ['جرش', 'OUTSIDE_AMMAN', 5],
  ['عجلون', 'OUTSIDE_AMMAN', 5],
  ['المفرق', 'OUTSIDE_AMMAN', 5],
  ['الكرك', 'OUTSIDE_AMMAN', 10],
  ['الطفيلة', 'OUTSIDE_AMMAN', 15, true],
  ['معان', 'OUTSIDE_AMMAN', 15, true],
  ['العقبة', 'OUTSIDE_AMMAN', 25, true],
];

export async function seedServices(prisma: PrismaClient) {
  if ((await prisma.serviceZone.count()) === 0) {
    await prisma.serviceZone.createMany({
      data: ZONES.map(([name, tier, fee, approval], i) => ({ name, tier, travelFee: D(fee), requiresApproval: !!approval, sortOrder: i })),
    });
    console.log('✓ مناطق الخدمات');
  }
  if ((await prisma.siteService.count()) === 0) await seedCatalog(prisma);
  await seedSignage(prisma);
  await seedInspectionV2(prisma);
  await seedInspectionV3(prisma);
}

async function seedCatalog(prisma: PrismaClient) {

  const devices = {} as Record<DeviceKey, string>;
  for (const [i, d] of DEVICES.entries()) {
    devices[d.key] = (await prisma.serviceDevice.create({ data: { name: d.name, description: d.description, fee: D(d.fee), sortOrder: i } })).id;
  }
  const ids: Record<string, string> = {};
  for (const [i, s] of SERVICES.entries()) {
    const created = await prisma.siteService.create({
      data: {
        slug: s.slug,
        name: s.name,
        summary: s.summary,
        includes: s.includes,
        audiences: s.audiences,
        requestTypes: s.requestTypes ?? INSPECT,
        priceInside: D(s.inside),
        priceOutside: D(s.outside),
        durationMinutes: s.minutes ?? 60,
        visitFeePolicy: s.policy ?? 'SEPARATE',
        featured: !!s.featured,
        sortOrder: i,
      },
    });
    ids[s.slug] = created.id;
  }
  const water = ids[WATER_SLUG];
  await prisma.serviceDeviceLink.createMany({ data: DEVICES.map((d) => ({ serviceId: water, deviceId: devices[d.key] })) });
  for (const [i, [name, keys, isOther]] of WATER_PROBLEMS.entries()) {
    await prisma.serviceProblem.create({
      data: { serviceId: water, name, isOther: !!isOther, sortOrder: i, devices: { connect: keys.map((k) => ({ id: devices[k] })) } },
    });
  }
  await prisma.serviceBundle.create({
    data: {
      name: 'زيارة فحص مجمعة للمنزل',
      priceInside: D(35),
      priceOutside: D(50),
      terms: 'تشمل الخدمات المختارة في نفس العقار وخلال نفس الزيارة.',
      services: { connect: ['cracks-inspection', 'general-property-inspection', 'paint-finishing-inspection', 'electrical-inspection', 'roof-waterproofing-inspection', 'hvac-inspection', WATER_SLUG].map((slug) => ({ id: ids[slug] })) },
    },
  });
  console.log('✓ كتالوج الخدمات والمعاينات');
}

export const SIGNAGE_SLUG = 'industrial-wayfinding-signage';

const SIGNAGE_OPTIONS: [string, string, boolean][] = [
  [
    'تعديل مواقع اللافتات الإرشادية الحالية',
    'دراسة مواقع اللافتات الموجودة\nاقتراح نقل اللافتات إلى مواقع أكثر وضوحًا وفاعلية\nتحسين اتجاهات اللافتات وارتفاعاتها ومواقع تثبيتها\nتحديد اللافتات التي تحتاج إلى تعديل أو استبدال',
    false,
  ],
  [
    'إضافة لافتات إرشادية جديدة',
    'تحديد المواقع التي تحتاج إلى لافتات جديدة\nاقتراح أنواع اللافتات وأحجامها ومحتواها\nتحديد اتجاهات الحركة ومسارات الوصول\nلافتات للأقسام والمخازن والمكاتب والمرافق ومناطق التحميل والتنزيل\nلافتات التحذير والسلامة عند الحاجة وفق المتطلبات المعتمدة للموقع',
    false,
  ],
  [
    'دراسة التغذية البصرية والوضوح الإرشادي للموقع',
    'دراسة توزيع اللافتات الحالية داخل المنشأة\nتقييم وضوح اللافتات وسهولة قراءتها من مسافات مناسبة\nتقييم الألوان والتباين والخطوط والرموز المستخدمة\nدراسة تسلسل المعلومات وتوجيه الأشخاص من المدخل إلى وجهاتهم\nتحديد النقاط التي تسبب التشتت أو صعوبة الوصول أو الالتباس\nاقتراح تحسينات تجعل النظام الإرشادي أوضح وأكثر اتساقًا',
    false,
  ],
  [
    'إعداد دراسة متكاملة لنظام اللافتات الإرشادية',
    'معاينة الموقع وجمع المعلومات اللازمة\nمخطط بمواقع اللافتات الحالية والمقترحة\nمخطط توزيع اللافتات على المباني والأقسام والمسارات\nنوع كل لافتة ومحتواها وأبعادها وطريقة تثبيتها المقترحة\nجدول بالكميات والأنواع والمواقع\nتوصيات لتحسين الحركة والتوجيه والوضوح البصري\nتقرير فني ومخططات توضيحية بحسب نطاق المشروع',
    true,
  ],
  [
    'تصميم وتصنيع وتركيب اللافتات الجديدة',
    'تصميم اللافتات وفق هوية المنشأة واحتياجاتها\nاختيار المواد المناسبة لطبيعة البيئة الصناعية\nتصنيع اللافتات حسب التصميم المعتمد\nتركيب اللافتات في المواقع المحددة\nتنفيذ التعديلات المطلوبة بعد اعتماد العميل',
    true,
  ],
];

const SIGNAGE_FIELDS = [
  { key: 'company', label: 'اسم المصنع أو الشركة', type: 'text', required: true },
  { key: 'activity', label: 'نوع المنشأة وطبيعة النشاط', type: 'text', required: true },
  { key: 'size', label: 'المساحة التقريبية أو عدد المباني والأقسام', type: 'text', required: true, hint: 'لفهم نطاق المشروع فقط — لا يُحسب سعر الزيارة بالمتر' },
  { key: 'signs', label: 'عدد اللافتات الحالية (إن كان معروفًا)', type: 'number', required: false },
  { key: 'stages', label: 'المراحل المطلوبة', type: 'multiselect', required: true, options: ['الدراسة', 'التصميم', 'التصنيع والتركيب', 'جميع المراحل'] },
];

/** خدمة اللافتات الإرشادية للمنشآت الصناعية — تُضاف مرة واحدة (حتى على قاعدة فيها خدمات) */
async function seedSignage(prisma: PrismaClient) {
  const marker = 'seed_signage';
  if (await prisma.counter.findUnique({ where: { key: marker } })) return;
  if (!(await prisma.siteService.findUnique({ where: { slug: SIGNAGE_SLUG } }))) {
    const svc = await prisma.siteService.create({
      data: {
        slug: SIGNAGE_SLUG,
        name: 'تصميم ودراسة وتنفيذ وتطوير اللافتات الإرشادية للمباني الصناعية',
        summary: 'دراسة وتطوير اللافتات الإرشادية في المصانع والمستودعات لتحسين وضوح الحركة والتنقل وتنظيم الموقع وتسهيل الوصول للأقسام والمرافق، مع مراعاة متطلبات السلامة والتشغيل.',
        includes: 'زيارة ميدانية للموقع\nمعاينة اللافتات والمسارات الحالية\nتحديد نطاق المشروع والمخرجات المطلوبة',
        deliverables: [
          'تقرير تقييم الوضع الحالي',
          'مخطط مواقع اللافتات الحالية والمقترحة',
          'دراسة التغذية البصرية والوضوح الإرشادي',
          'قائمة اللافتات المطلوب تعديلها أو إضافتها',
          'التصاميم والمواصفات المقترحة',
          'جدول الكميات وعرض سعر مستقل للتصنيع والتركيب',
          'خطة تنفيذ ومراحل عمل عند الحاجة',
        ].join('\n'),
        terms: 'الدراسة التفصيلية والتصميم والتصنيع والتركيب تُسعّر بشكل منفصل وفق نطاق العمل المتفق عليه، ولا يبدأ أي منها إلا بعد اعتماد نطاق العمل وعرض السعر من العميل.',
        optionsLabel: 'ما الخدمات التي تحتاجها؟ (يمكن اختيار أكثر من خدمة)',
        formFields: SIGNAGE_FIELDS,
        audiences: ['BUSINESS'],
        requestTypes: ['INSPECTION_REPORT', 'REPAIR_QUOTE'],
        priceInside: D(35),
        priceOutside: D(50),
        durationMinutes: 120,
        visitFeePolicy: 'DEDUCTIBLE',
        featured: true,
        sortOrder: 1,
        problems: { create: SIGNAGE_OPTIONS.map(([name, description, quoteRequired], i) => ({ name, description, quoteRequired, sortOrder: i })) },
      },
    });
    const related = await prisma.siteService.findMany({
      where: { slug: { in: ['industrial-buildings-inspection', 'industrial-floors-inspection', 'metalwork-inspection', 'industrial-electrical-inspection'] }, deletedAt: null },
      select: { id: true },
    });
    if (related.length) {
      await prisma.serviceBundle.create({
        data: {
          name: 'زيارة مجمعة للمنشآت الصناعية',
          priceInside: D(60),
          priceOutside: D(85),
          terms: 'تشمل الخدمات المختارة في نفس المنشأة وخلال نفس الزيارة.',
          services: { connect: [{ id: svc.id }, ...related] },
        },
      });
    }
    console.log('✓ خدمة اللافتات الإرشادية');
  }
  await prisma.counter.create({ data: { key: marker, value: 1 } });
}
