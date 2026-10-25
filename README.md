# AddMedia

שיחה חיה, תגובות ומדיה על כל דף באינטרנט — עם כל מי שקורא אותו עכשיו.

| תיקייה | מה יש בה |
| --- | --- |
| `worker/` | השרת: Cloudflare Worker, חדר (Durable Object) לכל דף, D1, R2, סינון תוכן, ניהול, דפי האתר |
| `panel/` | הפאנל החברתי (Preact) — אותו קוד משמש את התוסף, את המובייל ואת האתר |
| `extension/` | תוסף Chrome/Edge: פאנל צד או מסך מפוצל (הדף למעלה, AddMedia למטה) |
| `mobile/` | אפליקציית Expo ל-iOS ו-Android: דפדפן למעלה, הפאנל למטה, ידית גרירה |
| `brand/` | הסמל (SVG ו-PNG) |
| `tools/pages.py` | מחולל דפי האתר (תנאים, פרטיות, כללים, נגישות, בעלי אתרים, יצירת קשר) |

## פריסה ל-Cloudflare (פעם אחת)

1. **חיבור ה-Repo:** ב-Cloudflare ← Workers & Pages ← Create ← Import a repository ← `arriellupa/addmedia`.
   - Root directory: `worker`
   - Build command: `npm ci && npm run build`
   - Deploy command: `npm run deploy`

   בפריסה הראשונה Wrangler יוצר לבד את מסד הנתונים `addmedia` (D1) ואת דלי האחסון `addmedia-media` (R2), ומחבר את הכתובת `addmedia.noaplate.com`. אם R2 עדיין לא הופעל בחשבון — יש להפעיל אותו פעם אחת בלוח הבקרה.

2. **סודות** (Worker ← Settings ← Variables and Secrets ← Add ← Secret):

   | שם | ערך |
   | --- | --- |
   | `ID_SECRET` | מחרוזת אקראית ארוכה (לפחות 32 תווים). **לא לשנות אחרי ההשקה** — היא קובעת את מזהי החדרים |
   | `ADMIN_TOKEN` | סיסמה ארוכה לדף הניהול |
   | `RESEND_API_KEY` | המפתח של Resend (כמו בקופה) — לשליחת קוד כניסה במייל |
   | `OPENAI_API_KEY` | לבדיקת טקסט ותמונות לפני פרסום. בלי מפתח פועלת רק שכבת החסימה העברית |

3. **מייל:** הכתובת `noreply@noaplate.com` חייבת להיות מאומתת ב-Resend (אותו דומיין כמו בקופה).

4. **סריקת חומרי פגיעה בילדים:** Cloudflare ← noaplate.com ← Caching ← Configuration ← CSAM Scanning Tool ← הפעלה.

5. **אחרי הפריסה:**
   - האתר: https://addmedia.noaplate.com
   - הפאנל בדפדפן: https://addmedia.noaplate.com/panel/?url=https://www.ynet.co.il
   - דף הניהול: https://addmedia.noaplate.com/admin/ (נכנסים עם `ADMIN_TOKEN`)
   - התוסף להורדה: https://addmedia.noaplate.com/addmedia-extension.zip

כל דחיפה ל-`main` פורסת מחדש אוטומטית.

## התקנת התוסף (Chrome / Edge)

1. מורידים את `addmedia-extension.zip` ופותחים לתיקייה.
2. `chrome://extensions` ← מצב מפתח ← טעינת תוסף לא ארוז ← בוחרים את התיקייה.
3. לחיצה על הסמל פותחת פאנל צד. כפתור הפיצול בפאנל (או Alt+Shift+S) מעביר למסך מפוצל.

## אפליקציית המובייל

```bash
cd mobile
npm install
npx expo start
```

סורקים את קוד ה-QR באפליקציית Expo Go בטלפון. לבניית גרסה לחנויות: `npx eas build` (נדרש חשבון Apple Developer ו-Google Play).

## פיתוח מקומי

```bash
npm run setup                  # התקנת תלויות
cd worker && npm run db:local  # יצירת מסד נתונים מקומי
npm run dev                    # השרת על http://127.0.0.1:8787
npm test                       # 47 בדיקות מקצה לקצה (בטרמינל נפרד)
```

לפיתוח מקומי יוצרים קובץ `worker/.dev.vars`:

```
DEV_MODE=true
ADMIN_TOKEN=local-admin
ID_SECRET=local-secret
TEST_PURCHASES=true
```

## מצב נוכחי

**עובד:**
- חדר לכל דף ולכל אתר, עם צ׳אט חי, תגובות, לייקים, מדיה, הצמדה ופרסום בית
- מחיקה אוטומטית בתום התוקף, ומחיקת חשבון מלאה
- סינון תוכן, דיווחים, חסימה, מצב איטי, דף ניהול ויומן החלטות
- טופס הסרה ופנייה, ודפי מדיניות
- תוסף Chrome בשני המצבים, ואפליקציית מובייל

**עוד לא:**
- **תשלומים:** פועלים במצב בדיקה (`TEST_PURCHASES=true`) — לא מתבצע חיוב. צריך לחבר רכישה בתוך האפליקציה ו-Paddle, וסולק ישראלי לפרסום.
- **התחברות:** כרגע במייל בלבד. Apple ו-Google עוד לא.
- **וידאו:** עדיין אין. העלאת מדיה תומכת בתמונות בלבד.
- **זיהוי כתבה שהשתנתה:** כרגע נשען על התוקף בלבד.
- **Firefox ו-Safari:** עדיין לא נתמכים.
- **דפי המדיניות:** טיוטות, עם [שדות למילוי].
