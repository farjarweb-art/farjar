/**
 * نظام الفحص الاحترافي للعقارات (الإصدار 2): الأجهزة التشخيصية بصورها وآلية عملها وفوائدها،
 * المعدات الثقيلة للمنشآت، الخدمات الأساسية وأسعار الأولوية، وزيارات الديكور، ومناطق المحافظات.
 * يُطبَّق مرة واحدة (حتى على قاعدة فيها بيانات) — بعدها كل شيء من لوحة التحكم.
 */
import { Prisma, type PrismaClient, type ServiceRequestType } from '@prisma/client';

const D = (n: number) => new Prisma.Decimal(n);
const IMG = (f: string) => `/images/devices/${f}.svg`;

type DeviceSeed = {
  code: string;
  name: string;
  fee: number;
  image: string;
  mechanism: string;
  benefits: string[];
  /** يُضاف تلقائيًا مع هذا الجهاز */
  parent?: string;
  scopePriced?: boolean;
  /** أسماء قديمة لنفس الجهاز (تحديث بدل التكرار) */
  oldNames?: string[];
  description?: string;
};

export const DEVICES_V2: DeviceSeed[] = [
  {
    code: 'thermal_inspection',
    name: 'فحص التصوير الحراري للأسطح والتمديدات',
    fee: 20,
    image: 'thermal-imager',
    oldNames: ['جهاز الفحص الحراري'],
    mechanism: 'تحويل الاختلافات الحرارية غير المرئية خلف الأسطح والجدران إلى خريطة حرارية ملونة بدقة متناهية ودون تكسير.',
    benefits: [
      'كشف تسريبات المياه الساخنة والباردة وخطوط التدفئة تحت البلاط',
      'رصد مسار النزيز والرطوبة داخل الجدران والخرسانة',
      'تقييم كفاءة العزل الحراري ونقاط الضعف بالأبواب والنوافذ',
      'فحص نقاط السخونة والحمل الزائد في لوحات الكهرباء والقواطع',
    ],
  },
  {
    code: 'schmidt_hammer_inspection',
    name: 'فحص صلابة وقوة الخرسانة (مطرقة شميدت)',
    fee: 25,
    image: 'schmidt-hammer',
    mechanism: 'إطلاق صدمة قياسية مرتدة وحساب قوة الارتداد لتحويلها لقراءات تبين المقاومة الضغطية للباطون دون تدمير الهيكل.',
    benefits: [
      'تقييم المتانة والسلامة الإنشائية للأعمدة والأسقف والقواعد',
      'كشف الضعف الخرساني المخفي قبل حدوث أي تشققات خطيرة',
      'فحص جاهزية المبنى للتوسع أو بناء طوابق إضافية',
      'توثيق رقمي معتمد يدمج في التقرير الفني',
    ],
  },
  {
    code: 'pipe_pressure_testing',
    name: 'فحص واختبار ضغط شبكات المواسير والسباكة',
    fee: 30,
    image: 'pressure-pump',
    oldNames: ['جهاز فحص ضغط المياه'],
    mechanism: 'ربط شبكة التغذية أو التدفئة بمضخة هيدروليكية ومراقبة ثبات الضغط عبر ساعة حساس رصد دقيقة.',
    benefits: [
      'الجزم التام بسلامة خطوط التغذية والتدفئة',
      'فحص قوة تحمل الأكواع واللحامات لمنع التسريب مستقبلًا',
      'حماية العميل من تكاليف الصيانة عبر الفحص الوقائي المبكر',
      'تحديد الخط المتضرر بدقة لتفادي الحفر العشوائي',
    ],
  },
  {
    code: 'acoustic_leak_detection',
    name: 'فحص كشف التسريبات الصوتي (HY929)',
    fee: 15,
    image: 'acoustic-detector',
    oldNames: ['جهاز الكشف الصوتي عن تسربات المياه'],
    mechanism: 'تضخيم الترددات الصوتية المجهرية الناجمة عن خروج الماء تحت الأرض أو الجدران عبر مجسات إبرية وأرضية.',
    benefits: [
      'الوصول المباشر للنقطة الصفرية للتسريب بدقة عالية جدًا',
      'إلغاء الحاجة لتكسير السيراميك أو الجدران بشكل عشوائي',
      'توفير تكاليف إعادة التبليط والترميم والدهان',
      'حل سريع ونظيف يحافظ على جمالية العقار',
    ],
  },
  {
    code: 'sewage_endoscope_inspection',
    name: 'فحص وتنظير خطوط الصرف الصحي والأنابيب',
    fee: 40,
    image: 'industrial-endoscope-camera',
    oldNames: ['جهاز تنظير الصرف الصحي بالكاميرا'],
    mechanism: 'إدخال كاميرا رقمية مرنة مزودة بإضاءة LED داخل الأنابيب لنقل بث حي ومباشر لشاشة الجهاز.',
    benefits: [
      'رؤية داخلية واضحة لخطوط الصرف دون تخريب',
      'تشخيص السبب الجذري للانسداد (دهون، تكسير، جذور، ميلان خاطئ)',
      'منع الحفر والتخريب العشوائي للأرضيات والساحات',
      'فحص شامل لشبكة التصريف قبل الشراء أو الاستلام',
    ],
  },
  {
    code: 'endoscope_hooks_free',
    name: 'خطافات ومجسات إزالة العوالق (إضافة مجانية 🎁)',
    fee: 0,
    image: 'endoscope-hooks-accessories',
    parent: 'sewage_endoscope_inspection',
    mechanism: 'تركيب أدوات دقيقة (خطاف سحب، مغناطيس، مرآة) على رأس الكاميرا للوصول إلى الأجسام العالقة.',
    benefits: [
      'إزالة وسحب الأجسام الغريبة والشوائب المسببة للانسداد فورًا',
      'إضافة مجانية ترفق تلقائيًا عند طلب فحص التنظير',
      'حل سريع ونظيف يعالج المشكلة دون تكسير أو حفر',
      'توفير تكاليف الصيانة الإضافية وحل العطل من الزيارة الأولى',
    ],
  },
  {
    code: 'sewage_test_ball_inspection',
    name: 'فحص واختبار ضغط وإغلاق خطوط الصرف الصحي',
    fee: 20,
    image: 'sewage-test-ball',
    mechanism: 'إدخال طابة مطاطية قابلة للنفخ لإغلاق الأنبوب كليًا، واختبار ثبات منسوب المياه وضغط الخط.',
    benefits: [
      'التأكد من خلو خطوط الصرف من التسريبات الخفية تحت الأرض',
      'فحص جودة اللحامات والوصلات تحت السيراميك والساحات',
      'حماية أساسات المبنى من أضرار رطوبة مياه الصرف',
      'تقييم شامل لسلامة شبكة التصريف قبل الشراء',
    ],
  },
  {
    code: 'electronic_moisture_testing',
    name: 'فحص نسبة الرطوبة الإلكتروني بدون إتلاف',
    fee: 15,
    image: 'pinless-moisture-meter',
    mechanism: 'استشعار كهرومغناطيسي غير مدمّر يقيس نسبة تشبع الخرسانة والجدران بالماء حتى عمق 17 ملم.',
    benefits: [
      'تحديد نسبة الرطوبة المئوية الدقيقة داخل طبقات المبنى',
      'كشف الرطوبة المخفية قبل ظهور آثارها على الدهانات',
      'فحص جاهزية الجدران والأرضيات لأعمال الدهان والباركيه',
      'تحديد مسار وحجم الانتشار المائي بدقة عالية',
    ],
  },
  {
    code: 'spherical_moisture_testing',
    name: 'فحص الرطوبة السريع بالمجس الكروي (GL62A)',
    fee: 10,
    image: 'gl62a-spherical-moisture-meter',
    mechanism: 'مستشعر كروي مرن يفحص تشبع الأسطح والمساحات الواسعة بالرطوبة إلكترونيًا وبدون إتلاف.',
    benefits: [
      'مسح وفحص مساحات واسعة من الجدران والألواح بسرعة فائقة',
      'كشف الرطوبة الكامنة والتسريبات المخفية دون إحداث خدوش',
      'التحقق من جفاف الأسطح تمامًا لضمان جودة الطلاء والترميم',
      'تحديد مواقع الخلل بدقة لتقليل تكاليف الصيانة',
    ],
  },
  {
    code: 'uv_light_inspection_free',
    name: 'فحص العفن والرطوبة بالأشعة فوق البنفسجية (إضافة مجانية 🎁)',
    fee: 0,
    image: 'uv-inspection-flashlight',
    mechanism: 'إصدار أشعة فوق بنفسجية لتسليطها على الجدران والزوايا لإظهار وتوهج بقع الرطوبة والعفن المخفي.',
    benefits: [
      'كشف بؤر العفن والرطوبة المستترة في زوايا وأركان العقار',
      'فحص إضافي مجاني يرفع جودة وموثوقية التقرير الفني',
      'التحقق من صحة البيئة الداخلية وسلامة الجدران',
      'إضافة قيمة تعزز اطمئنان العميل',
    ],
  },
  {
    code: 'digital_angle_finder_inspection',
    name: 'فحص ميول وهبوط البناء (جهاز القياس SZ-08)',
    fee: 10,
    image: 'sz-08-digital-angle-finder',
    mechanism: 'حساسات إلكترونية وزاوية متطورة تقيس زاوية الميل والتشوه الإنشائي بدقة وتعرضها على الشاشة.',
    benefits: [
      'رصد وقياس مقدار واتجاه ميلان الجدران والأعمدة في حالات التريح',
      'تقديم أرقام وقراءات هندسية دقيقة لتوثيقها في التقرير الفني',
      'تقييم سلامة واستقرار الهيكل الإنشائي للمبنى قبل الشراء',
      'المساعدة في اتخاذ قرار التدعيم والصيانة المبكرة',
    ],
  },
  {
    code: 'crack_width_gauge_free',
    name: 'أداة قياس سمك وعرض التشققات (إضافة مجانية 🎁)',
    fee: 0,
    image: 'crack-width-gauge',
    mechanism: 'إدخال المؤشر المتدرج المصنوع من الستانلس ستيل داخل الشق لقياس عرضه واتساعه بالملمتر.',
    benefits: [
      'تحديد القياس الدقيق لسمك وعرض التشققات والتصدعات',
      'إضافة مجانية مرفقة تلقائيًا عند حجز فحص التشققات والتريح',
      'دعم التقرير الفني بقراءات هندسية رقمية وموثوقة',
      'المساعدة في تقييم خطورة التشققات وحالة استقرار المبنى',
    ],
  },
  {
    code: 'laser_level_inspection',
    name: 'فحص مستويات الهبوط والميل بالميزان الليزري (TD8G)',
    fee: 10,
    image: 'shinty-td8g-laser-level',
    mechanism: 'إسقاط أشعة ليزر خضراء أفقية وعمودية باستخدام موازين بصرية وحامل ثلاثي لرصد تفاوت المستويات.',
    benefits: [
      'رصد دقيق لتفاوت ومستويات الهبوط في الأرضيات والجدران',
      'توفير خطوط مرجعية واضحة لتحديد مواضع التريح بدقة',
      'دعم التقرير الفني بقراءات مرئية موثوقة قبل الشراء',
      'سرعة وكفاءة عالية في فحص استواء كامل مساحات العقار',
    ],
  },
  {
    code: 'electrical_clamp_meter_inspection',
    name: 'فحص التيار والأحمال الكهربائية (TS26D)',
    fee: 10,
    image: 'ts26d-clamp-meter',
    mechanism: 'قياس التيار الكهرومغناطيسي والفولتية عبر الفك الحلقي وأطراف الاختبار الرقمية الذكية.',
    benefits: [
      'كشف الأحمال الزائدة وحماية الأسلاك والقواطع من التلف',
      'فحص استقرار شبكة الكهرباء واللوحة الرئيسية للعقار',
      'الوقاية من مخاطر التماس الكهربائي',
      'ضمان سلامة التمديدات وحماية الأجهزة المنزلية الحساسة',
    ],
  },
  {
    code: 'uni_t_ut122_multimeter_inspection',
    name: 'فحص الكهرباء والحرارة الإلكتروني الدقيق (UT122)',
    fee: 10,
    image: 'uni-t-ut122-multimeter',
    mechanism: 'قياس رقمي ذكي للقيمة الفعالة الحقيقية (True RMS) وتحليل الفولتية والحرارة بدقة عبر أطراف ومجسات متطورة.',
    benefits: [
      'تشخيص دقيق لمستويات الفولتية واستقرار التيار في شبكة العقار',
      'كشف السخونة المخفية في القواطع واللوحات الكهربائية لمنع الحرائق',
      'حماية الأجهزة الكهربائية الحساسة من أعطال التذبذب والتماس',
      'قراءات فنية رقمية موثوقة تعزز أمان وسلامة المبنى',
    ],
  },
  {
    code: 'ridgid_k1500_commercial_drain',
    name: 'ماكينة تسليك الصرف الصحي الثقيلة (RIDGID K-1500)',
    fee: 0,
    image: 'ridgid-k1500-commercial',
    scopePriced: true,
    description: 'مخصصة للمنشآت التجارية والشركات للتعامل مع الأقطار الكبيرة والانسدادات المستعصية.',
    mechanism: 'إدخال كابلات فولاذية صلبة مدفوعة بمحرك قوي لتفتيت الدهون والجذور وفتح الخطوط الكبيرة.',
    benefits: [
      'معالجة الانسدادات الكبرى في المجمعات والشركات',
      'تفتيت وإزالة أصعب الدهون والعوالق الصلبة',
      'تسعير عادل ومدروس حسب مساحة وواقع العمل الميداني',
      'ضمان استمرارية عمل المنشأة دون تعطل',
    ],
  },
  {
    code: 'ropuls_heating_flushing_system',
    name: 'جهاز غسيل وتطهير شبكات الأوفر فلور والتدفئة (ROPULS)',
    fee: 0,
    image: 'ropuls-heating-flusher',
    scopePriced: true,
    description: 'منظومة ضغط متطورة لغسيل شبكات التدفئة الأرضية والمركزية ومسارات المياه للمنشآت الكبرى.',
    mechanism: 'ضخ مزيج متقطع من الماء والهواء المضغوط لتفتيت وإزالة الترسبات والكلس والشوائب من داخل الأنابيب.',
    benefits: [
      'استعادة الكفاءة الحرارية القصوى لأنظمة التدفئة الأرضية والمركزية',
      'تخفيض استهلاك الطاقة والوقود عبر تنظيف مسارات المياه تمامًا',
      'حماية الأنابيب والمضخات من التآكل وإطالة العمر الافتراضي للنظام',
      'تسعير عادل بناءً على مساحة وأطوال الشبكات الفعلية',
    ],
  },
];

/** المحافظات ومناطقها (أسماء المحافظات القديمة في القاعدة بين قوسين للمطابقة) */
export const GOVERNORATES: { name: string; aliases: string[]; tier: 'INSIDE_AMMAN' | 'OUTSIDE_AMMAN'; regions: string[] }[] = [
  { name: 'عمّان', aliases: ['عمان'], tier: 'INSIDE_AMMAN', regions: ['عمان الغربية', 'عمان الشرقية', 'وادي السير', 'صويلح', 'الجبيهة', 'تلاع العلي', 'العبدلي', 'بسمان', 'ناعور', 'الجيزة', 'الموقر', 'أبو نصير', 'طارق', 'الخريبة'] },
  { name: 'إربد', aliases: ['اربد'], tier: 'OUTSIDE_AMMAN', regions: ['إربد المركز (قصبة إربد)', 'الرمثا', 'بني عبيد', 'الكورة', 'المزار الشمالي', 'الطيبة', 'الوسطية', 'بني كنانة', 'الأغوار الشمالية'] },
  { name: 'الزرقاء', aliases: [], tier: 'OUTSIDE_AMMAN', regions: ['الزرقاء المركز (قصبة الزرقاء)', 'الرصيفة', 'الهاشمية', 'بيرين', 'الأزرق'] },
  { name: 'البلقاء (السلط)', aliases: ['السلط / البلقاء', 'البلقاء'], tier: 'OUTSIDE_AMMAN', regions: ['السلط المركز (قصبة السلط)', 'عين الباشا', 'دير علا', 'الشونة الجنوبية', 'ماحص والفحيص'] },
  { name: 'مأدبا', aliases: ['مادبا'], tier: 'OUTSIDE_AMMAN', regions: ['مادبا المركز (قصبة مادبا)', 'ذيبان', 'الفيصلية'] },
  { name: 'الكرك', aliases: [], tier: 'OUTSIDE_AMMAN', regions: ['الكرك المركز (قصبة الكرك)', 'المزار الجنوبي', 'القصر', 'عي', 'فقوع', 'الأغوار الجنوبية', 'القطرانة'] },
  { name: 'الطفيلة', aliases: [], tier: 'OUTSIDE_AMMAN', regions: ['الطفيلة المركز (قصبة الطفيلة)', 'بصيرا', 'الحسا'] },
  { name: 'معان', aliases: [], tier: 'OUTSIDE_AMMAN', regions: ['معان المركز (قصبة معان)', 'البتراء (وادي موسى)', 'الشوبك', 'الجفر', 'الحسينية'] },
  { name: 'العقبة', aliases: [], tier: 'OUTSIDE_AMMAN', regions: ['العقبة المركز (قصبة العقبة)', 'القويرة', 'الديسة'] },
  { name: 'جرش', aliases: [], tier: 'OUTSIDE_AMMAN', regions: ['جرش المركز (قصبة جرش)', 'المرقب', 'برما', 'ساكب'] },
  { name: 'عجلون', aliases: [], tier: 'OUTSIDE_AMMAN', regions: ['عجلون المركز (قصبة عجلون)', 'كفرنجة', 'صخرة'] },
  { name: 'المفرق', aliases: [], tier: 'OUTSIDE_AMMAN', regions: ['المفرق المركز (قصبة المفرق)', 'البادية الشمالية', 'الرويشد', 'بلعما', 'صبحا'] },
];

/** صفة العميل (الخطوة الأولى في رحلة الفحص) */
const ADDONS_STRUCTURAL = ['crack_width_gauge_free', 'schmidt_hammer_inspection', 'digital_angle_finder_inspection', 'laser_level_inspection', 'thermal_inspection', 'electronic_moisture_testing', 'spherical_moisture_testing', 'uv_light_inspection_free'];
const ADDONS_WATER = ['thermal_inspection', 'acoustic_leak_detection', 'pipe_pressure_testing', 'sewage_endoscope_inspection', 'endoscope_hooks_free', 'sewage_test_ball_inspection', 'electronic_moisture_testing', 'spherical_moisture_testing', 'uv_light_inspection_free'];
const ADDONS_ELECTRICAL = ['thermal_inspection', 'electrical_clamp_meter_inspection', 'uni_t_ut122_multimeter_inspection'];
const ADDONS_ALL = DEVICES_V2.filter((d) => !d.scopePriced).map((d) => d.code);
const HEAVY = DEVICES_V2.filter((d) => d.scopePriced).map((d) => d.code);
/** مجانية مشمولة دائمًا في الزيارة */
const ALWAYS_FREE = ['uv_light_inspection_free'];

type ServiceSeed = {
  slug: string;
  name: string;
  summary: string;
  includes: string[];
  audiences: ('HOME' | 'BUSINESS')[];
  requestTypes: ServiceRequestType[];
  inside: number;
  outside: number;
  urgent?: number;
  emergency?: number;
  devices: string[];
  /** أجهزة تُضاف تلقائيًا لكل حجز */
  auto?: string[];
  terms?: string;
  deliverables?: string[];
  featured?: boolean;
  sortOrder: number;
  policy?: 'DEDUCTIBLE' | 'SEPARATE';
};

const SERVICES_V2: ServiceSeed[] = [
  {
    slug: 'cracks-inspection',
    name: 'فحص التشققات والتريح في البناء + تقرير فني أولي',
    summary: 'معاينة السلامة الإنشائية، تحديد أسباب التشققات والتريحات، وتزويدك بتقرير فني أولي — مع إمكانية الزيارة العاجلة أو الطارئة.',
    includes: ['معاينة السلامة الإنشائية للمبنى', 'تحديد أسباب التشققات والتريحات', 'قياس عرض التشققات (أداة مجانية مرفقة)', 'تقرير فني أولي بالنتائج والتوصيات', 'تسجيل إحداثيات الموقع (GPS) في التقرير'],
    audiences: ['HOME', 'BUSINESS'],
    requestTypes: ['INSPECTION_REPORT', 'DIAGNOSIS', 'REPAIR_QUOTE', 'REPAIR'],
    inside: 35,
    outside: 35,
    urgent: 50,
    emergency: 70,
    devices: ADDONS_STRUCTURAL,
    auto: ['crack_width_gauge_free'],
    featured: true,
    sortOrder: 0,
    policy: 'DEDUCTIBLE',
  },
  {
    slug: 'commercial-site-visit',
    name: 'زيارة الفحص والكشف الفني للمنشآت التجارية والشركات',
    summary: 'كشف فني ميداني أولي للمنشأة داخل وخارج عمّان، مع عروض أسعار للديكور والكهرباء والصرف الصحي والتغذية والتدفئة والأعمال الخارجية. أعمال الصيانة والتسليك الكبرى تُسعّر حسب المساحات.',
    includes: ['كشف فني ميداني أولي للمنشأة', 'عروض أسعار لأعمال الديكور الشاملة', 'عروض أسعار لصيانة الكهرباء والتمديدات', 'عروض أسعار لخطوط الصرف الصحي ومياه التغذية والتدفئة', 'عروض أسعار للأعمال الخارجية'],
    audiences: ['BUSINESS'],
    requestTypes: ['INSPECTION', 'INSPECTION_REPORT', 'REPAIR_QUOTE', 'REPAIR', 'PREVENTIVE', 'CONTRACT'],
    inside: 35,
    outside: 35,
    devices: [...ADDONS_ALL, ...HEAVY],
    terms: 'أعمال الصيانة والتسليك الكبرى والمعدات الثقيلة تُسعّر لاحقًا حسب المساحات ونطاق العمل.',
    featured: true,
    sortOrder: 1,
    policy: 'DEDUCTIBLE',
  },
  {
    slug: 'decor-modifications-visit',
    name: 'زيارة كشف لعمل ديكورات وتعديلات (منازل وشقق)',
    summary: 'زيارة للموقع مع اقتراحات تصميمية وهندسية، وعرض سعر للأعمال المطلوبة.',
    includes: ['تقديم اقتراحات تصميمية وهندسية للموقع', 'تقديم عرض سعر للأعمال المطلوبة'],
    audiences: ['HOME'],
    requestTypes: ['INSPECTION', 'REPAIR_QUOTE'],
    inside: 20,
    outside: 35,
    devices: [],
    sortOrder: 2,
    policy: 'DEDUCTIBLE',
  },
];

/** روابط الأجهزة للخدمات الموجودة */
const EXTRA_LINKS: Record<string, string[]> = {
  'water-leaks-moisture': ADDONS_WATER,
  'electrical-inspection': ADDONS_ELECTRICAL,
  'industrial-electrical-inspection': ADDONS_ELECTRICAL,
  'general-property-inspection': ['thermal_inspection', 'electronic_moisture_testing', 'spherical_moisture_testing', 'uv_light_inspection_free', 'digital_angle_finder_inspection', 'laser_level_inspection', 'schmidt_hammer_inspection', 'electrical_clamp_meter_inspection'],
  'pre-purchase-inspection': ['thermal_inspection', 'electronic_moisture_testing', 'uv_light_inspection_free', 'schmidt_hammer_inspection', 'digital_angle_finder_inspection', 'laser_level_inspection', 'sewage_endoscope_inspection', 'endoscope_hooks_free', 'electrical_clamp_meter_inspection'],
  'industrial-buildings-inspection': [...ADDONS_STRUCTURAL, 'electrical_clamp_meter_inspection', ...HEAVY],
  'roof-waterproofing-inspection': ['thermal_inspection', 'electronic_moisture_testing', 'spherical_moisture_testing', 'uv_light_inspection_free'],
};

/** مشكلات قسم التسربات ← الأجهزة المناسبة */
const WATER_PROBLEM_DEVICES: [string, string[]][] = [
  ['رطوبة', ['thermal_inspection', 'electronic_moisture_testing', 'spherical_moisture_testing', 'uv_light_inspection_free', 'acoustic_leak_detection']],
  ['داخل الجدران', ['acoustic_leak_detection', 'thermal_inspection', 'electronic_moisture_testing']],
  ['شبكة المياه', ['acoustic_leak_detection', 'pipe_pressure_testing', 'thermal_inspection']],
  ['ضغط المياه', ['pipe_pressure_testing']],
  ['الأسطح', ['thermal_inspection', 'spherical_moisture_testing', 'electronic_moisture_testing']],
  ['الصرف', ['sewage_endoscope_inspection', 'sewage_test_ball_inspection']],
  ['الأنابيب', ['acoustic_leak_detection', 'pipe_pressure_testing', 'sewage_endoscope_inspection', 'sewage_test_ball_inspection']],
];

export async function seedInspectionV2(prisma: PrismaClient) {
  const marker = 'seed_inspection_v2';
  if (await prisma.counter.findUnique({ where: { key: marker } })) return;

  // 1) الأجهزة: تحديث القديم (بالرمز أو الاسم القديم) أو إنشاء الجديد
  const ids: Record<string, string> = {};
  for (const [i, d] of DEVICES_V2.entries()) {
    const existing =
      (await prisma.serviceDevice.findUnique({ where: { code: d.code } })) ??
      (d.oldNames ? await prisma.serviceDevice.findFirst({ where: { name: { in: d.oldNames }, code: null } }) : null);
    const data = {
      code: d.code,
      name: d.name,
      fee: D(d.fee),
      description: d.description ?? d.mechanism,
      mechanism: d.mechanism,
      benefits: d.benefits.join('\n'),
      scopePriced: !!d.scopePriced,
      sortOrder: i,
      active: true,
      // صورة يرفعها المدير لاحقًا لا تُستبدل
      ...(existing?.imagePublicId ? {} : { imageUrl: IMG(d.image) }),
    };
    const saved = existing ? await prisma.serviceDevice.update({ where: { id: existing.id }, data }) : await prisma.serviceDevice.create({ data });
    ids[d.code] = saved.id;
  }
  for (const d of DEVICES_V2.filter((x) => x.parent)) {
    await prisma.serviceDevice.update({ where: { id: ids[d.code] }, data: { parentId: ids[d.parent!] } });
  }

  // 2) الخدمات الأساسية
  const serviceIds: Record<string, string> = {};
  for (const s of SERVICES_V2) {
    const data = {
      name: s.name,
      summary: s.summary,
      includes: s.includes.join('\n'),
      audiences: s.audiences,
      requestTypes: s.requestTypes,
      priceInside: D(s.inside),
      priceOutside: D(s.outside),
      priceUrgent: s.urgent != null ? D(s.urgent) : null,
      priceEmergency: s.emergency != null ? D(s.emergency) : null,
      terms: s.terms ?? '',
      featured: !!s.featured,
      visitFeePolicy: s.policy ?? 'SEPARATE',
      sortOrder: s.sortOrder,
      active: true,
    };
    const existing = await prisma.siteService.findFirst({ where: { slug: s.slug, deletedAt: null } });
    const saved = existing ? await prisma.siteService.update({ where: { id: existing.id }, data }) : await prisma.siteService.create({ data: { ...data, slug: s.slug } });
    serviceIds[s.slug] = saved.id;
    await linkDevices(prisma, saved.id, s.devices.map((c) => ids[c]), (s.auto ?? []).map((c) => ids[c]), ALWAYS_FREE.map((c) => ids[c]));
  }

  // 3) ربط الأجهزة بالخدمات الموجودة
  for (const [slug, codes] of Object.entries(EXTRA_LINKS)) {
    const svc = await prisma.siteService.findFirst({ where: { slug, deletedAt: null }, select: { id: true } });
    if (svc) await linkDevices(prisma, svc.id, codes.map((c) => ids[c]), [], ALWAYS_FREE.map((c) => ids[c]));
  }
  const water = await prisma.siteService.findFirst({ where: { slug: 'water-leaks-moisture', deletedAt: null }, include: { problems: true } });
  if (water) {
    for (const p of water.problems) {
      const match = WATER_PROBLEM_DEVICES.find(([k]) => p.name.includes(k));
      if (match && !p.isOther) await prisma.serviceProblem.update({ where: { id: p.id }, data: { devices: { set: match[1].map((c) => ({ id: ids[c] })) } } });
    }
  }

  // 4) زيارة مجمعة للفحص الإنشائي مع الرطوبة — فحص التشققات صار بسعر 35 فيخرج من باقة المنزل (35) حتى لا تصير بقية الخدمات مجانية
  const cracksId = serviceIds['cracks-inspection'];
  const homeBundle = await prisma.serviceBundle.findFirst({ where: { name: 'زيارة فحص مجمعة للمنزل' } });
  if (homeBundle && cracksId) await prisma.serviceBundle.update({ where: { id: homeBundle.id }, data: { services: { disconnect: { id: cracksId } } } });
  const bundleSlugs = ['cracks-inspection', 'water-leaks-moisture', 'general-property-inspection', 'electrical-inspection'];
  const bundleServices = await prisma.siteService.findMany({ where: { slug: { in: bundleSlugs }, deletedAt: null }, select: { id: true } });
  if (bundleServices.length >= 2 && !(await prisma.serviceBundle.findFirst({ where: { name: 'زيارة فحص شامل للعقار' } }))) {
    await prisma.serviceBundle.create({
      data: { name: 'زيارة فحص شامل للعقار', priceInside: D(45), priceOutside: D(55), terms: 'تشمل الخدمات المختارة في نفس العقار وخلال نفس الزيارة، وتضاف رسوم الأجهزة المختارة.', services: { connect: bundleServices } },
    });
  }

  // 5) المحافظات ومناطقها
  const zones = await prisma.serviceZone.findMany();
  for (const [i, g] of GOVERNORATES.entries()) {
    const z = zones.find((x) => x.name === g.name || g.aliases.includes(x.name));
    if (z) await prisma.serviceZone.update({ where: { id: z.id }, data: { regions: g.regions } });
    else await prisma.serviceZone.create({ data: { name: g.name, tier: g.tier, regions: g.regions, sortOrder: i } });
  }

  await prisma.counter.create({ data: { key: marker, value: 1 } });
  console.log('✓ نظام الفحص الاحترافي (الأجهزة والمناطق والخدمات الأساسية)');
}

/** يضيف روابط الأجهزة للخدمة دون حذف ما أضافه المدير */
async function linkDevices(prisma: PrismaClient, serviceId: string, deviceIds: string[], autoIds: string[], freeIds: string[]) {
  for (const deviceId of [...new Set(deviceIds)]) {
    const free = freeIds.includes(deviceId);
    const auto = autoIds.includes(deviceId);
    await prisma.serviceDeviceLink.upsert({
      where: { serviceId_deviceId: { serviceId, deviceId } },
      create: { serviceId, deviceId, included: free || auto, autoInclude: auto },
      update: { ...(free || auto ? { included: true } : {}), ...(auto ? { autoInclude: true } : {}) },
    });
  }
}

/**
 * v3 — الحجز الموحد: "الفحص الشامل" يعرض كل أجهزة الفحص المتاحة (عدا المعدات الثقيلة للمنشآت)،
 * وفحص الكهرباء أجهزة الكهرباء فقط، والتسربات أجهزة المياه (مربوطة في v2).
 */
export async function seedInspectionV3(prisma: PrismaClient) {
  const marker = 'seed_inspection_v3';
  if (await prisma.counter.findUnique({ where: { key: marker } })) return;
  const general = await prisma.siteService.findFirst({ where: { slug: 'general-property-inspection', deletedAt: null } });
  if (general) {
    const devices = await prisma.serviceDevice.findMany({ where: { code: { in: ADDONS_ALL } }, select: { id: true, code: true } });
    const id = (c: string) => devices.find((d) => d.code === c)?.id;
    await linkDevices(prisma, general.id, devices.map((d) => d.id), [], ALWAYS_FREE.map(id).filter(Boolean) as string[]);
    if (general.name === 'الفحص الفني العام للعقار') await prisma.siteService.update({ where: { id: general.id }, data: { name: 'الفحص الفني الشامل للعقار' } });
  }
  await prisma.counter.create({ data: { key: marker, value: 1 } });
  console.log('✓ الحجز الموحد: أجهزة الفحص الشامل');
}

/** v4 — باقة "فحص أجهزة شامل": كل أجهزة الفحص في زيارة واحدة بسعر مستقل (يُعدّل من لوحة التحكم) */
export async function seedInspectionV4(prisma: PrismaClient) {
  const marker = 'seed_inspection_v4';
  if (await prisma.counter.findUnique({ where: { key: marker } })) return;
  const data = {
    name: 'فحص أجهزة شامل — كل أجهزة الفحص في زيارة واحدة',
    description: 'باقة شاملة بسعر واحد بدل إضافة كل جهاز وحده.',
    mechanism: 'يحضر الفني كل أجهزة الفحص المتاحة ويستخدم منها ما يلزم حسب حالة الموقع: التصوير الحراري، كشف التسريبات، اختبارات الضغط، التنظير، قياس الرطوبة، فحوصات الإنشاء والكهرباء.',
    benefits: ['كل أجهزة الفحص بسعر واحد أوفر من إضافتها منفردة', 'تشخيص كامل للعقار في زيارة واحدة دون زيارات إضافية', 'لا داعي لمعرفة الجهاز المناسب — الفني يختار حسب الحالة', 'تقرير فني شامل بقراءات كل الفحوصات'].join('\n'),
    fee: D(120),
    imageUrl: IMG('full-device-package'),
    coversAll: true,
    sortOrder: -1,
    active: true,
  };
  const existing = await prisma.serviceDevice.findUnique({ where: { code: 'full_device_package' } });
  if (!existing) await prisma.serviceDevice.create({ data: { ...data, code: 'full_device_package' } });
  await prisma.counter.create({ data: { key: marker, value: 1 } });
  console.log('✓ باقة فحص الأجهزة الشامل');
}

/**
 * v5 — خيار "جميع الأجهزة" لكل فحص بسعره الخاص: يُربط بكل خدمة لها أجهزة، وسعره المبدئي ≈ 70% من مجموع أجهزتها
 * (مقرّب لأقرب 5 دنانير). يعدّله المدير من: الخدمة ← الأجهزة ← "رسوم خاصة".
 */
export async function seedInspectionV5(prisma: PrismaClient) {
  const marker = 'seed_inspection_v5';
  if (await prisma.counter.findUnique({ where: { key: marker } })) return;
  const pkg = await prisma.serviceDevice.findUnique({ where: { code: 'full_device_package' } });
  if (pkg) {
    if (pkg.name.startsWith('فحص أجهزة شامل')) {
      await prisma.serviceDevice.update({
        where: { id: pkg.id },
        data: { name: 'جميع الأجهزة — فحص أجهزة شامل', description: 'اختيار كل أجهزة هذا الفحص دفعة واحدة بسعر واحد أوفر.' },
      });
    }
    const services = await prisma.siteService.findMany({ where: { deletedAt: null }, include: { devices: { include: { device: true } } } });
    for (const s of services) {
      const own = s.devices.filter((l) => l.device.active && !l.device.coversAll && !l.device.scopePriced && !l.device.parentId && !l.autoInclude && !l.included);
      if (own.length < 2 || s.devices.some((l) => l.deviceId === pkg.id)) continue;
      const sum = own.reduce((n, l) => n + Number(l.fee ?? l.device.fee), 0);
      const fee = Math.max(10, Math.round((sum * 0.7) / 5) * 5);
      await prisma.serviceDeviceLink.create({ data: { serviceId: s.id, deviceId: pkg.id, fee: D(fee) } });
    }
  }
  await prisma.counter.create({ data: { key: marker, value: 1 } });
  console.log('✓ خيار جميع الأجهزة لكل فحص');
}
