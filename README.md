# ☁️ سَحابة — درايفك المحلي

تطبيق تخزين ملفات مبني من الصفر كبديل عملي يجمع مميزات Google Drive و OneDrive و Dropbox. البيانات الوصفية في SQLite، ومحتوى الملفات إما على قرص السيرفر أو على Google Drive عبر Apps Script — من غير مفاتيح API أو قاعدة بيانات خارجية.

> المشروع القديم `درايفي` (Next.js + GCS) لسه في مجلدات `src/` و `legacy/` في الـ repo الأصلي ولم يتعدّل عليه أي تعديل.

---

## المميزات

| Feature | التفاصيل |
| --- | --- |
| **سجل الإصدارات** | كل رفع/تحرير ينشئ إصدار جديد. استعراض، تنزيل أي إصدار، استعادة كإصدار جديد، وحذف الإصدارات القديمة تلقائياً بعد 50 إصدار. |
| **تحرير وتعليقات** | محرر نصوص/ماركداون مع حفظ تلقائي، إشعارات تعاون، تعليقات على الملفات، وحضور مباشر (من متصل بالملف). |
| **فرق ومساحات مشتركة** | إنشاء فرق، أدوار (مالك / محرر / قارئ)، إضافة أعضاء بالبريد، إشعارات دعوة، ومساحة لكل فريق. |
| **وسوم وبحث متقدم** | وسوم ملوّنة + بحث بالاسم والوصف ونوع الملف والوسم والتاريخ والحجم والمفضلة مع ترتيب مختلف. |
| **حماية الروابط** | رابط عام بصلاحية (معاينة / تنزيل / تعليق)، كلمة سر، تاريخ انتهاء، حد للمشاهدات والتنزيلات، سجل للأحداث، وإلغاء الرابط. |
| **تطبيقات سطح المكتب والموبايل** | PWA قابل للتثبيت على كل المنصات + عميل مزامنة سطح المكتب (`sync/client.mjs`) يرفع مجلد محلي تلقائياً. |
| **الأساسيات** | رفع بالسحب والإفلات، مجلدات، نسخ/نقل/إعادة تسمية، مفضلة، سلة مهملات واستعادة، معاينة صور/فيديو/صوت/PDF/نصوص، وواجهة عربية RTL متجاوبة. |
| **مباشر (Realtime)** | WebSocket للتحديثات والإشعارات والتعليقات وحالة الاتصال — بدون polling. |
| **إجراءات جماعية** | تحديد أكتر من عنصر (Ctrl/Shift + نقرة أو Ctrl+A) وتنزيل/مفضلة/وسوم/نقل/حذف أو استعادة في طلب واحد. |
| **مراقبة وصيانة** | `/api/health` لفحص SQLite و Drive، نسخة احتياطية دورية لـ SQLite، وتحديد لمعدل الطلبات لكل IP. |

---

## التشغيل

المطلوب: **Node.js 22.5+** (تم التطوير والاختبار على Node 26 — `node:sqlite` مدمج، مفيش حاجة لـ `better-sqlite3`).

```bash
cd cloudbox
npm install
npm run dev
```

افتح **http://localhost:5173** واعمل حساب جديد. أول مستخدم يبقى ليه مساحة خاصة فوراً.

أو للإنتاج:

```bash
npm run build
npm start          # http://localhost:4000 — يقدّم الواجهة والـ API معاً
```

### الأوامر

| الأمر | الوصف |
| --- | --- |
| `npm run dev` | يشغّل الـ API على 4000 و Vite على 5173 مع proxy. |
| `npm run build` | بناء الواجهة في `dist/`. |
| `npm start` | تشغيل السيرفر في وضع الإنتاج (يقدّم `dist/`). |
| `npm run typecheck` | فحص TypeScript. |

### المتغيرات (كلها اختيارية)

| المتغير | الافتراضي | الوصف |
| --- | --- | --- |
| `PORT` | `4000` | منفذ الـ API / الإنتاج. |
| `HOST` | `0.0.0.0` | عنوان الربط. |
| `SAHABA_DATA_DIR` | `./data` | مجلد قاعدة البيانات (وملفات `blobs/` في الوضع المحلي). |
| `SAHABA_MAX_UPLOAD_MB` | `4096` / `20` في وضع Drive | أقصى حجم ملف مرفوع. |
| `SAHABA_MAX_VERSIONS` | `50` | عدد الإصدارات المحتفظة بكل ملف. |
| `SAHABA_STORAGE_LIMIT_MB` | `10240` | مساحة كل مستخدم. |
| `SAHABA_STORAGE_MODE` | `local` / `drive` | يختار محتوى الملفات: قرص السيرفر أو Google Drive. وجود `SAHABA_DRIVE_WEBAPP_URL` يفعّل `drive` تلقائياً. |
| `SAHABA_DRIVE_WEBAPP_URL` | — | رابط `/exec` لتطبيق Apps Script الخاص بحساب Drive الحالي. |
| `SAHABA_DRIVE_TOKEN` | — | التوكن السري المطابق للتوكن داخل `Code.gs` للحساب الحالي. |
| `SAHABA_DRIVE_MIGRATE_FROM_URL` | — | رابط `/exec` لحساب Drive القديم. ضبطه يعمل نقل لمرة واحدة عند إقلاع السيرفر. |
| `SAHABA_DRIVE_MIGRATE_FROM_TOKEN` | — | توكن الـ Web App القديم. مطلوب مع المتغير اللي قبله؛ يُحذف هو والرابط بعد النقل. |
| `SAHABA_BACKUP_ENABLED` | `1` | تفعيل النسخ الاحتياطي الدوري لـ SQLite (`0` للإيقاف). |
| `SAHABA_BACKUP_INTERVAL_HOURS` | `24` | كل ساعة/ساعات بيتم أخذ نسخة جديدة. |
| `SAHABA_BACKUP_INITIAL_DELAY_MS` | `15000` | تأخير أول نسخة بعد الإقلاع (مفيد للاختبار). |
| `SAHABA_BACKUP_RETENTION` | `7` | عدد النسخ المحتفظ بها؛ الأقدم تُحذف تلقائياً. |
| `SAHABA_BACKUP_SPACE` | `backups` | مجلد Drive الذي تستقبل النسخ: `sahaba-drive-storage-backups`. |
| `SAHABA_RATE_WINDOW_MS` | `60000` | نافذة تحديد معدل الطلبات لكل IP. |
| `SAHABA_RATE_MAX` | `120` | أقصى طلبات لكل IP في النافذة (عدا المصادقة والـ health). |
| `SAHABA_AUTH_RATE_WINDOW_MS` | `600000` | نافذة طلبات الدخول/التسجيل. |
| `SAHABA_AUTH_RATE_MAX` | `10` | أقصى محاولات دخول/تسجيل لكل IP في النافذة. |

---

## تخزين الملفات على Google Drive (Apps Script)

البيانات الوصفية (المستخدمون، الإصدارات، التعليقات، الوسوم، المشاركات) تفضل في SQLite.
محتوى الملفات بس بيتخزن في مجلدات `sahaba-drive-storage-*` داخل Google Drive عبر Apps Script Web App.

1. افتح [Google Apps Script](https://script.google.com)، أنشئ مشروع و الصق محتوى `apps-script/Code.gs`.
2. من **Project Settings → Script Properties** أضف خاصية اسمها `SAHABA_TOKEN` وقيمتها توكن عشوائي طويل (`node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`). التوكن مش مكتوب في الكود.
3. Deploy → New deployment → Web app: **Execute as Me** و **Who has access: Anyone**.
4. ضع رابط `/exec` في `SAHABA_DRIVE_WEBAPP_URL` ونفس التوكن في `SAHABA_DRIVE_TOKEN`، ثم أعد تشغيل السيرفر.
5. جرّب: `curl "<WEBAPP_URL>?token=<TOKEN>&action=ping"` → لازم يرجع `{"ok":true,...}`.

> التوكن سري؛ أي حد يعرفه (مع الرابط) يقدر يرفع/ينزّل/يمسح blobs في Drive. خزّنه في Script Properties وفي متغيرات بيئة السيرفر فقط — مش في الـ repo.
> حد الرفع العملي في وضع Drive هو 20MB للملف (حد URL Fetch في Apps Script = 50MB، والـ base64 يكبّر الحجم ~33%).

### نقل الملفات من Drive قديم إلى Drive جديد

البيانات الوصفية في SQLite ما تتحركش؛ اللي بيتنقل هو محتوى الملفات (الـ blobs) ومعرّفاتها داخل قاعدة البيانات.

1. اعمل Deploy للـ Web App الجديد وحدّث `SAHABA_DRIVE_WEBAPP_URL` و `SAHABA_DRIVE_TOKEN` بالرابط والتوكن الجديدين.
2. أضف `SAHABA_DRIVE_MIGRATE_FROM_URL` و `SAHABA_DRIVE_MIGRATE_FROM_TOKEN` للـ Web App القديم (لا تحذفه أو تؤرشفه قبل ما النقل يخلص).
3. أعد تشغيل السيرفر مرة واحدة. عند الإقلاع بيُنزّل كل blob من الحساب القديم، يرفعه على الجديد، ثم يحدّث `items.blob_path` و `versions.blob_path` في معاملة SQLite واحدة. هتلاقي في السجل:
   ```
   ☁️  تم نقل N ملف إلى Drive الجديد
   ```
4. بعد ما النقل ينجح وتتأكد إن التنزيل شغال، **احذف المتغيرين `SAHABA_DRIVE_MIGRATE_*`** وأعد التشغيل عشان النقل ما يتكررش.

> فشل أي ملف أثناء النقل يخلي المعرّفات القديمة كما هي والسيرفر **ما يبدأش** (عشان ما يترفعش ملف جديد على الحساب الجديد والقديم لسه مستخدم). أعد المحاولة بعد إصلاح السبب. بعد نجاح النقل، الملفات الجديدة بتترفع على الحساب الجديد مباشرة.

### فحص الصحة (Health check)

`GET /api/health` متاح للعامة ويرجع حالة SQLite والـ Web App وآخر نسخة احتياطية:

```bash
curl https://sahaba-drive.de.deplexo.com/api/health
```

الرد بيشمل `ok`, `db`, `drive.ok`, `drive.latencyMs`, `backup`. لو قاعدة البيانات أو Drive مش سليمين، حالة الرد تبقى `503`.

### نسخ SQLite الاحتياطي

- أول نسخة بعد 15 ثانية من الإقلاع، وبعدها كل `SAHABA_BACKUP_INTERVAL_HOURS`.
- في وضع Drive تترفع نسخة `.sqlite` في مجلد `sahaba-drive-storage-backups` — وفي الوضع المحلي تتنقل إلى `data/backups/`.
- عدد النسخ محكوم بـ `SAHABA_BACKUP_RETENTION`، والأقدم تُحذف تلقائياً.
- النسخة مأخوذة بـ `VACUUM INTO`، يعني لقطة متسقة حتى لو كان فيه WAL.

### تحديد معدل الطلبات

- كل طلبات `/api/` (عدا `/api/health`) محدودة بـ `SAHABA_RATE_MAX` في `SAHABA_RATE_WINDOW_MS` لكل IP.
- `/api/auth/login` و `/api/auth/register` ليهم حد أشد: `SAHABA_AUTH_RATE_MAX` في `SAHABA_AUTH_RATE_WINDOW_MS`.
- عند التجاوز الرد بيبقى `429` مع `Retry-After`، وكل رد بيحمل هيدرات `x-ratelimit-*`.
- خلف reverse proxy زي Deplexo بيتم استخدام `x-forwarded-for` لتحديد عنوان العميل.

---

## أين توجد بياناتك؟

```
cloudbox/data/
├── sahaba.sqlite     # المستخدمون، الملفات، الإصدارات، الوسوم، التعليقات، المشاركات...
└── blobs/            # محتوى الملفات في الوضع المحلي فقط (اسم كل ملف = UUID)
```

في الوضع المحلي كل شيء على جهازك ومفيش طلبات لخدمات خارجية. في وضع Drive محتوى الملفات بيتخزن في مجلدات `sahaba-drive-storage-*` داخل Drive، وSQLite بيخزّن معرّفات الملفات بس. لو حذفت مجلد `data/` في الوضع المحلي هتبدأ من الصفر.

كلمات المرور مخزّنة كـ scrypt مع salt عشوائي، والجلسات cookies بـ HttpOnly + SameSite.

---

## تثبيت التطبيق على الموبايل / سطح المكتب (PWA)

1. شغّل التطبيق بـ `npm run build` ثم `npm start` (أو افتح dev URL).
2. من متصفح Chrome/Edge: قائمة ⋮ → **Install app / تثبيت التطبيق**.
3. من iPhone Safari: مشاركة → **Add to Home Screen**.

التطبيق هيفتح كنافذة مستقلة ويقدر يشتغل offline للواجهة (الشل) — الملفات نفسها لازم السيرفر يكون شغال عشان توصلها.

## عميل مزامنة سطح المكتب

عميل Node بسيط يراقب مجلد على جهازك ويرفع أي ملف جديد أو معدّل إلى مساحتك تلقائياً:

```bash
node sync/client.mjs \
  --dir ./my-drive \
  --email you@example.com \
  --password 'كلمة المرور' \
  --interval 15
```

أو بالمتغيرات: `SAHABA_DIR`, `SAHABA_EMAIL`, `SAHABA_PASSWORD`, `SAHABA_SPACE`, `SAHABA_URL`.

العميل بينشئ مجلدات الـ remote بنفس هيكل المجلد المحلي، وبيخزّن بصمة الملفات في `.sahaba-sync.json` عشان ما يرفعش نفس الملف مرتين. كل رفع بيعمل إصدار جديد في السجل.

---

## هيكل الكود

```
cloudbox/
├── server/
│   ├── index.mjs             # HTTP server + routing + static + production
│   ├── config.mjs            # إعدادات المسارات والبيئة ووضع التخزين
│   ├── db.mjs                # مخطط SQLite (node:sqlite)
│   ├── storage.mjs           # تخزين الـ blobs: محلي أو Google Drive
│   ├── migrate.mjs           # نقل الـ blobs من Web App قديم لجديد (مرة واحدة)
│   ├── backup.mjs            # نسخ SQLite الاحتياطي إلى Drive أو مجلد محلي
│   ├── rate-limit.mjs        # تحديد معدل الطلبات لكل IP
│   ├── util.mjs              # مصادقة، صلاحيات، تخزين، أحداث
│   └── routes/
│       ├── health.mjs        # GET /api/health
│       ├── auth.mjs          # تسجيل / دخول / ملف شخصي
│       ├── items.mjs         # ملفات، مجلدات، رفع، إصدارات، سلة
│       ├── collab.mjs        # WS، تعليقات، وسوم، إشعارات، بحث
│       ├── teams.mjs         # فرق وأعضاء ومشاركة معك
│       ├── shares.mjs        # روابط المشاركة (جهة المالك)
│       └── public.mjs        # الوصول العام للروابط
├── src/
│   ├── App.tsx               # توجيه بسيط: تسجيل / درايف / رابط عام
│   ├── api.ts / types.ts
│   ├── components/
│   │   ├── Auth.tsx / DriveApp.tsx / PublicShare.tsx
│   │   ├── Dialogs.tsx       # مشاركة، إصدارات، وسوم، فرق، بحث متقدم
│   │   ├── Viewers.tsx       # معاينة، محرر، تعليقات
│   │   └── ui.tsx
│   └── styles.css            # Tailwind 4 + ثيم RTL
├── sync/client.mjs            # عميل مزامنة سطح المكتب
└── public/                    # manifest + service worker + أيقونة
```

---

## حدود مقصودة (مهم عشان تكون الصورة واضحة)

- **التعاون**: حالياً تحرير مستندات نصية مع حفظ تلقائي + إشعارات مباشرة وحضور. مش محرر CRDT متعدد المؤلفين في نفس اللحظة (زي Google Docs) — ده مشروع أكبر لوحده.
- **الموبايل**: PWA قابل للتثبيت، مش binary أصلي لـ App Store / Google Play.
- **المزامنة**: عميل سطح المكتب يرفع تغييراتك للسحابة (One-way). المزامنة العكسية (تنزيل تلقائي للجهاز) مش مدمجة؛ تقدر تنزّل من الواجهة أو تضيفها بسهولة في `sync/client.mjs`.
- **الأمان**: التطبيق مصمم للاستخدام المحلي/الداخلي. لو هتنشره على الإنترنت، ضعه خلف Reverse proxy مع HTTPS، واضبط `SAHABA_STORAGE_LIMIT_MB`، وفكّر في إضافة Rate limiting و CSRF token للـ endpoints الحساسة.

---

## استكشاف الأخطاء

- `node:sqlite` مش متاح → حدّث Node لـ 22.5+ (يفضّل 26).
- المنفذ 4000 مستخدم → `PORT=4001 npm start` (لازم تغيّر proxy في `vite.config.ts` لو شغّال dev).
- الرفع فشل → تأكد إن `data/blobs/` قابل للكتابة وإن `SAHABA_MAX_UPLOAD_MB` مناسب.
- الرابط العام بيطلب كلمة سر → استخدم زر "فتح الرابط"، والـ grant بيتخزّن في sessionStorage للجلسة دي.
