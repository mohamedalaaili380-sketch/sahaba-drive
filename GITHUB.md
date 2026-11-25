# رفع المشروع على GitHub

المجلد ده نسخة نظيفة جاهزة: **من غير `node_modules` ولا `dist` ولا بياناتك المحلية** (`data/`).
الـ repo اتعمل بالفعل وفيه commit واحد، كل اللي عليك إضافت الـ remote والـ push.

## من سطر الأوامر

```bash
cd sahaba-drive

# 1) اعمل repo جديد فاضي على github.com (من غير README / .gitignore)
#    و انسخ الرابط اللي هيطلع لك

# 2) اربط الـ remote (بدّل <USER> و <REPO>)
git remote add origin https://github.com/<USER>/<REPO>.git

# 3) ادفع
git branch -M main
git push -u origin main
```

لو الـ repo عندك اسمه مختلف أو فيه commits، استخدم:

```bash
git remote add origin https://github.com/<USER>/<REPO>.git
git fetch origin
git pull origin main --allow-unrelated-histories
git push -u origin main
```

## من متصفح GitHub (من غير terminals)

1. افتح [github.com/new](https://github.com/new) واعمل repo جديد.
2. اسحب ملف `sahaba-drive.zip` أو محتويات المجلد داخل صفحة الـ repo وارفعها.
3. تأكد إن `.gitignore` موجود في الـ root عشان ما ترفعش `node_modules/` أو `data/`.

## بعد الرفع

```bash
npm install
npm run dev     # الواجهة: http://localhost:5173
```

الـ README داخل المشروع فيه كل التفاصيل (التشغيل، المميزات، عميل المزامنة، المتغيرات).

> ملاحظة: بيانات الحسابات والملفات اللي جرّبتها محلياً **مش** مرفوعة — موجودة بس في `cloudbox/data/` في جهازك.
