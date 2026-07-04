# HR Glass Pro V14 Production

نسخة منظمة Modules ومجهزة للبيع التجريبي:

- js/main.js: تشغيل وربط الواجهة
- js/db.js: Firebase Firestore actions
- js/payroll.js: حساب المرتبات والحضور
- js/i18n.js: عربي / إنجليزي كامل
- js/utils.js: Toast / Loader / CSV / Print PDF
- Service Worker + Manifest PWA
- Backup / Restore JSON
- Import Fingerprint CSV
- Firestore Rules قوية حسب الدور

## التشغيل
لا تفتح index.html مباشرة. شغل من localhost:

```powershell
cd "F:\OneDrive\Desktop\HR PRO\hr-glass-pro-v14"
npx serve .
```

ثم افتح الرابط الذي يظهر مثل:
http://localhost:3000

## Firebase Rules
انسخ محتوى firebase-rules.txt وضعه في:
Firebase Console > Firestore Database > Rules > Publish

## مهم لإنشاء موظف له Login
من صفحة الموظفين:
- اضغط إضافة موظف
- اكتب Email
- اكتب Password مؤقت
- عند الحفظ يتم إنشاء حساب Auth للموظف بدون خروج الأدمن

لو تركت Password فارغًا سيتم حفظ الموظف فقط بدون حساب دخول.

## Import Fingerprint CSV
الأعمدة المطلوبة:

```csv
fingerprintId,date,time,type
1001,2026-05-09,08:30,IN
1001,2026-05-09,17:10,OUT
```

## الطباعة PDF
من المرتبات أو كارت الموظف اضغط طباعة ثم اختر Save as PDF من المتصفح.

## ملاحظات أمان
Rules قوية حسب الدور، لكن أول مرة تأكد أن مستند الأدمن في users يحتوي:

```json
{
  "role": "admin",
  "companyId": "main",
  "active": true
}
```


## V16 Notes
- Requests now show employee name and Employee ID.
- Approving advance/deduction/absence deducts from payroll automatically.
- Approving bonus/overtime/adjustment adds to payroll automatically.
- Admin can still add manual payroll transactions and split into installments.

## V18 Stable Fixes
- إصلاح زر إلغاء داخل النوافذ حتى لا يطلب بيانات إجبارية.
- إصلاح حفظ الشيفتات بإغلاق صحيح وتحديث القائمة فوراً.
- إصلاح ظهور حضور وانصراف الموظف داخل لوحة الأدمن بربط السجل بأكثر من مفتاح: uid / employeeDocId / employeeId / email / fingerprintId.
- إصلاح قبول الطلب بحيث يحدّث حالة الطلب محلياً ويضيف حركة مرتب عند القبول.
- إصلاح حركات المرتب اليدوية وتقسيم الأقساط وظهورها فوراً في كشف المرتب.
