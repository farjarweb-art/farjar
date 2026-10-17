/**
 * نقل البيانات من قاعدة البيانات القديمة (حساب Render السابق) إلى الحالية — مرة واحدة.
 *
 * يعمل فقط إذا وُضع OLD_DATABASE_URL (External Database URL للقاعدة القديمة) في متغيرات السيرفر.
 * ينسخ كل الجداول (المنتجات، الموردين، الطلبات، العملاء، الإعدادات…) ويستبدل محتوى القاعدة الحالية،
 * داخل معاملة واحدة: أي خطأ = لا يتغير شيء. لا يمسّ عدّاد الزوار ولا سجل الهجرات.
 * بعد النجاح يُسجَّل ذلك فلا يتكرر، ويمكن حذف المتغير.
 */
import { PrismaClient } from '@prisma/client';

const SKIP = new Set(['_prisma_migrations', 'Counter']);
const MARKER = 'old_db_import';
const BATCH = 1000;

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

type Row = Record<string, unknown>;

async function tables(db: PrismaClient) {
  const rows = await db.$queryRawUnsafe<{ t: string }[]>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);
  return rows.map((r) => r.t).filter((t) => !SKIP.has(t));
}

async function columns(db: PrismaClient, table: string) {
  const rows = await db.$queryRawUnsafe<{ c: string }[]>(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, table);
  return rows.map((r) => r.c);
}

export async function importOldDatabase(oldUrl: string, current: PrismaClient = new PrismaClient()) {
  const old = new PrismaClient({ datasourceUrl: oldUrl });
  try {
    const done = await current.$queryRawUnsafe<Row[]>(`SELECT 1 FROM "Counter" WHERE key = $1`, MARKER);
    if (done.length) {
      console.log('• نقل البيانات القديمة تم سابقًا — يمكن حذف OLD_DATABASE_URL');
      return { skipped: true as const };
    }

    const [oldProducts] = await old.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "Product"`);
    const [newProducts] = await current.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "Product"`);
    if (newProducts.n > oldProducts.n) {
      console.warn(`! القاعدة الحالية فيها منتجات (${newProducts.n}) أكثر من القديمة (${oldProducts.n}) — أُلغي النقل حتى لا تضيع بيانات جديدة.`);
      return { skipped: true as const };
    }

    const oldTables = new Set(await tables(old));
    const targets = (await tables(current)).filter((t) => oldTables.has(t));

    // نسخ الصفوف من القديمة (كنص JSON على دفعات)
    const data: { table: string; cols: string[]; batches: string[]; count: number }[] = [];
    for (const table of targets) {
      const oldCols = new Set(await columns(old, table));
      const cols = (await columns(current, table)).filter((c) => oldCols.has(c));
      const [{ n }] = await old.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${q(table)}`);
      const batches: string[] = [];
      for (let offset = 0; offset < n; offset += BATCH) {
        const [{ j }] = await old.$queryRawUnsafe<{ j: string }[]>(
          `SELECT coalesce(json_agg(t), '[]')::text AS j FROM (SELECT ${cols.map(q).join(', ')} FROM ${q(table)} ORDER BY ctid LIMIT ${BATCH} OFFSET ${offset}) t`,
        );
        batches.push(j);
      }
      data.push({ table, cols, batches, count: n });
    }

    const summary: Record<string, number> = {};
    await current.$transaction(
      async (tx) => {
        // القيود بين الجداول تُرفع مؤقتًا أثناء النسخ ثم تُعاد كما هي (وتتحقق من سلامة البيانات عند إعادتها)
        const fks = await tx.$queryRawUnsafe<{ tbl: string; name: string; def: string }[]>(
          `SELECT conrelid::regclass::text AS tbl, conname AS name, pg_get_constraintdef(oid) AS def
             FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`,
        );
        for (const fk of fks) await tx.$executeRawUnsafe(`ALTER TABLE ${fk.tbl} DROP CONSTRAINT ${q(fk.name)}`);

        await tx.$executeRawUnsafe(`TRUNCATE ${targets.map(q).join(', ')}`);
        for (const { table, cols, batches, count } of data) {
          const list = cols.map(q).join(', ');
          for (const j of batches) {
            await tx.$executeRawUnsafe(`INSERT INTO ${q(table)} (${list}) SELECT ${list} FROM json_populate_recordset(null::${q(table)}, $1::json)`, j);
          }
          summary[table] = count;
        }

        for (const fk of fks) await tx.$executeRawUnsafe(`ALTER TABLE ${fk.tbl} ADD CONSTRAINT ${q(fk.name)} ${fk.def}`);

        // العدّادات التلقائية (إن وُجدت) تكمل من آخر رقم
        const seqs = await tx.$queryRawUnsafe<{ tbl: string; col: string; seq: string }[]>(
          `SELECT c.table_name AS tbl, c.column_name AS col, pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) AS seq
             FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.column_default LIKE 'nextval(%'`,
        );
        for (const s of seqs) {
          if (!s.seq) continue;
          await tx.$executeRawUnsafe(`SELECT setval('${s.seq}', coalesce((SELECT max(${q(s.col)}) FROM ${q(s.tbl)}), 0) + 1, false)`);
        }

        await tx.$executeRawUnsafe(`INSERT INTO "Counter" (key, value, "updatedAt") VALUES ($1, 1, now()) ON CONFLICT (key) DO NOTHING`, MARKER);
      },
      { timeout: 10 * 60_000, maxWait: 60_000 },
    );

    console.log(`✓ نُقلت البيانات القديمة: ${summary.Product ?? 0} منتج، ${summary.Vendor ?? 0} مورد، ${summary.Order ?? 0} طلب، ${summary.Customer ?? 0} عميل`);
    return { skipped: false as const, summary };
  } finally {
    await old.$disconnect();
  }
}

if (require.main === module) {
  const url = process.env.OLD_DATABASE_URL?.trim();
  if (!url) process.exit(0);
  const current = new PrismaClient();
  importOldDatabase(url, current)
    .catch((e) => {
      // فشل النقل لا يوقف الموقع — والقاعدة الحالية لم تتغير
      console.error('✗ فشل نقل البيانات القديمة (لم يتغير شيء):', e instanceof Error ? e.message : e);
    })
    .finally(() => current.$disconnect());
}
