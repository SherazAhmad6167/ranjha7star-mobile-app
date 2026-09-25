/**
 * Seeded into Settings > "Recovery Received" the first time it is opened, so
 * the wording can be edited without a code change. Mirrors the operator's
 * recovery template, addressed to the person the cash was handed to.
 */
export const DEFAULT_RECOVERY_RECEIVED_TEMPLATE = `*NASSTEC AIR NET PVT. LTD.*
*RECOVERY RECEIVED | ریکوری موصول*

Dear *{Received By}*,
Recovery has been submitted to you by *{Operator Name}*.

Recovery Date: *{Recovery Date}*
Area: *{Area}*
Total Recovery: *Rs. {Total Recovery}*
Total Expenses: *Rs. {Total Expenses}*
Amount Received: *Rs. {Remaining Amount}*
Operator Contact: *{Operator Phone}*

*NASSTEC AIR NET PVT. LTD.*
---
محترم *{Received By}*،
*{Operator Name}* کی جانب سے ریکوری آپ کو جمع کروائی گئی ہے۔

تاریخ: *{Recovery Date}*
علاقہ: *{Area}*
کل ریکوری: *Rs. {Total Recovery}*
کل اخراجات: *Rs. {Total Expenses}*
موصول رقم: *Rs. {Remaining Amount}*
آپریٹر رابطہ: *{Operator Phone}*

*NASSTEC AIR NET PVT. LTD.*`;

/**
 * Seeded into Settings the first time it is opened. Sent by SMS from the
 * Website Content page when a customer review is approved for publishing.
 */
export const DEFAULT_REVIEW_APPROVED_TEMPLATE = `*{Company Name}*
*THANK YOU FOR YOUR REVIEW | تبصرے کا شکریہ*

Dear *{Customer Name}*,
JazakAllah for taking the time to review your connection. Your review is now published on our website for other customers to read.

Area: *{Area}*
Helpline: *{Number}*
---
محترم *{Customer Name}*،
اپنے کنکشن کے بارے میں رائے دینے کا بہت شکریہ۔ آپ کا تبصرہ اب ہماری ویب سائٹ پر شائع کر دیا گیا ہے۔

ہیلپ لائن: *{Number}*

*{Company Name}*`;

/** Sent by SMS when a review is declined, so the customer still hears back. */
export const DEFAULT_REVIEW_DECLINED_TEMPLATE = `*{Company Name}*
*ABOUT YOUR REVIEW | آپ کے تبصرے کے بارے میں*

Dear *{Customer Name}*,
Thank you for the review you sent us. We are not able to publish this one on our website.

If anything about your service needs attention, please call *{Number}* and our team will sort it out for you.
---
محترم *{Customer Name}*،
آپ کے بھیجے گئے تبصرے کا شکریہ۔ فی الحال ہم اسے ویب سائٹ پر شائع نہیں کر سکے۔

اگر آپ کی سروس میں کوئی مسئلہ ہے تو براہِ کرم *{Number}* پر رابطہ کریں، ہماری ٹیم اسے حل کرے گی۔

*{Company Name}*`;
