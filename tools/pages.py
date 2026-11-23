# Generates the static Hebrew pages of the InThePage site into worker/public. Run: python3 tools/pages.py
import json
import os

PUB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "worker", "public")
UPDATED = "26.10.2026"

HEAD = """<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/site.css">
</head>
<body>
<header class="top"><div class="top-in">
  <a class="logo" href="/"><img src="/favicon.svg" alt="">InThePage</a>
  <nav class="nav">
    <a href="/mobile/">בטלפון</a>
    <a href="/rules/">כללי הקהילה</a>
    <a href="/publishers/">לבעלי אתרים</a>
    <a href="/contact/">יצירת קשר</a>
  </nav>
</div></header>
"""

FOOT = """
<footer class="foot"><div class="foot-in">
  <span>© 2026 InThePage</span>
  <a href="/terms/">תנאי שימוש</a>
  <a href="/privacy/">מדיניות פרטיות</a>
  <a href="/rules/">כללי הקהילה</a>
  <a href="/accessibility/">הצהרת נגישות</a>
  <a href="/publishers/">לבעלי אתרים</a>
  <a href="/contact/">יצירת קשר ובקשת הסרה</a>
  <span>InThePage אינה קשורה לאתרים שלצידם היא מוצגת.</span>
</div></footer>
</body>
</html>
"""

DRAFT = '<div class="note draft">טיוטה לבדיקה משפטית לפני פרסום. הפרטים בסוגריים מרובעים ימולאו לפני ההשקה.</div>'


def page(path, title, desc, body):
    d = os.path.join(PUB, path)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w") as f:
        f.write(HEAD.format(title=title, desc=desc) + body + FOOT)


page("", "InThePage — כל דף באינטרנט הוא חדר", "שיחה חיה, תגובות ומדיה על כל דף שאתם קוראים — עם כל מי שקורא אותו עכשיו.", """
<main class="wrap wide">
  <section style="display:grid;grid-template-columns:1.05fr .95fr;gap:40px;align-items:center;padding-top:20px" class="hero">
    <div>
      <div style="display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--live);margin-bottom:14px"><span style="width:8px;height:8px;border-radius:50%;background:var(--live)"></span> חי עכשיו על אלפי דפים</div>
      <h1>כל דף באינטרנט<br>הוא חדר.</h1>
      <p class="lead">InThePage מוסיפה לכל כתבה, סרטון או דף שיחה חיה, תגובות ומדיה — עם כל מי שקורא אותו בדיוק עכשיו. האתר נשאר כמו שהוא; השיחה צמודה אליו.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:24px">
        <a class="btn btn-primary" href="/get/">הוספה ל-Chrome</a>
        <a class="btn btn-secondary" href="/mobile/">בטלפון</a>
        <a class="btn btn-secondary" href="/panel/?url=https://www.ynet.co.il/">לנסות בדפדפן</a>
      </div>
      <p style="font-size:13px;color:var(--t3);margin-top:14px">טקסט וצ׳אט בחינם. תמונות והצמדה ארוכה — בתשלום קטן.</p>
    </div>
    <div><img src="/hero.png" alt="דף כתבה למעלה, ומתחתיו השיחה החיה של InThePage" style="width:100%;max-width:440px;display:block;margin:0 auto"></div>
  </section>
  <div class="grid3">
    <div class="card"><h3>שיחה חיה</h3><p>מדברים עם מי שקורא איתכם את אותו דף — עכשיו. אין אף אחד בדף? עוברים בלחיצה לשיחה על האתר כולו.</p></div>
    <div class="card"><h3>תגובות שנשארות</h3><p>טוקבק לכל דף, גם באתרים שסגרו תגובות. כל תגובה נשמרת 7 ימים, ונמחקת אוטומטית כשהכתבה יורדת.</p></div>
    <div class="card"><h3>מדיה והצמדה</h3><p>תמונה מהשטח, צילום מסך או גרף — צמודים לדף. רוצים שיישארו? הצמדה ל-30, 90 או 365 ימים.</p></div>
  </div>
  <h2>בטוח מהיום הראשון</h2>
  <p>כל הודעה עוברת סינון לפני פרסום — ביטויים פוגעניים, איומים ופרטים אישיים לא עולים. אפשר לדווח, לחסום ולהשתיק בכל רגע, ובדפי בנקים, בריאות והתחברות הפאנל כבוי. איננו שומרים היסטוריית גלישה.</p>
  <p><a href="/rules/">כללי הקהילה</a> · <a href="/privacy/">מדיניות פרטיות</a> · <a href="/publishers/">בעלי אתרים: איך לשלוט במה שמוצג אצלכם</a></p>
</main>
<style>@media (max-width:860px){.hero{grid-template-columns:1fr!important}}</style>
""")

page("get", "התקנת InThePage ל-Chrome", "התקנת התוסף של InThePage לדפדפן Chrome.", """
<main class="wrap">
  <h1>התקנה ל-Chrome</h1>
  <p class="lead">התוסף נמצא בחנות של Chrome. לחיצה אחת, והוא מותקן ומתעדכן לבד.</p>
  <p><a class="btn btn-primary" href="https://chromewebstore.google.com/detail/kkeefmpcopkjpljhehakkapnehhbbkpb" rel="noopener">הוספה ל-Chrome</a></p>
  <ol>
    <li>לחצו על "הוספה ל-Chrome" בחנות, ואשרו.</li>
    <li>הצמידו את סמל InThePage לסרגל הכלים (סמל הפאזל שליד שורת הכתובת).</li>
    <li>גלשו לכל דף ולחצו על הסמל.</li>
  </ol>
  <h2>שלושה מצבי תצוגה</h2>
  <p><strong>פאנל צד</strong> — נצמד לצד החלון. <strong>מסך מפוצל</strong> — הדף בחלק העליון של המסך ו-InThePage בחלק התחתון; לחיצה על סמל הפיצול בפאנל, או Alt+Shift+S. <strong>דף מלא</strong> — InThePage בלשונית משלו, בכפתור שבראש הפאנל. בין פאנל הצד למסך המפוצל, הבחירה האחרונה נשמרת, ולחיצה על הסמל פותחת אותה שוב.</p>
<p id="refnote" class="small" hidden></p>
  <script>
  // a site owner's link (/r/<code>) lands here: keep the code on this site for 60 days, so a sign-up in the panel counts for them
  (function () {
    var q = new URLSearchParams(location.search), c = q.get("ref"), s = q.get("site");
    if (!c || !/^[a-z0-9]{6,16}$/.test(c)) return;
    try { localStorage.setItem("itp_ref", JSON.stringify({ code: c, at: Date.now() })); } catch (e) {}
    if (s) { var n = document.getElementById("refnote"); n.textContent = "הגעתם מהאתר " + s + ". אחרי ההתקנה, החדר של האתר מחכה לכם."; n.hidden = false; }
  })();
  </script>
</main>
""")

page("rules", "כללי הקהילה — InThePage", "כללי הקהילה של InThePage.", f"""
<main class="wrap">
  <h1>כללי הקהילה</h1>
  <p class="meta">עודכן: {UPDATED}</p>
  <p class="lead">InThePage היא שיחה של אנשים שקוראים את אותו דף. כדי שתישאר נעימה, אלה הכללים.</p>
  <h2>מה אסור</h2>
  <ul>
    <li><strong>פגיעה באחרים:</strong> קללות, השפלה, הטרדה, בריונות ופניות חוזרות למי שביקש שלא.</li>
    <li><strong>שנאה והסתה:</strong> נגד אדם או קבוצה בשל מוצא, דת, לאום, מגדר, נטייה מינית, מוגבלות או כל מאפיין אחר.</li>
    <li><strong>איומים ואלימות:</strong> איום, עידוד לאלימות או האדרתה.</li>
    <li><strong>פרטים אישיים:</strong> טלפון, כתובת, מספר זהות, מקום עבודה או תמונה של אדם אחר בלי הסכמתו.</li>
    <li><strong>תוכן מיני:</strong> כל תוכן מיני, ובפרט תמונה אינטימית של אדם בלי הסכמתו. תוכן הנוגע לקטינים מדווח לרשויות.</li>
    <li><strong>הונאה וספאם:</strong> קישורים מטעים, התחזות, פרסום סמוי ותגובות אוטומטיות.</li>
    <li><strong>הפרת זכויות:</strong> תוכן שאין לכם זכות לפרסם.</li>
  </ul>
  <h2>מה קורה כשמפרים</h2>
  <p>הודעה שנחסמת בסינון האוטומטי לא מתפרסמת. תוכן שמקבל כמה דיווחים מוסתר עד בדיקה. אנו בודקים דיווחים תוך 24 שעות, ודיווחים על תמונה אינטימית או על קטינים — תוך 48 שעות לכל היותר ובעדיפות עליונה. הפרה חוזרת מובילה להשעיית החשבון.</p>
  <h2>כלים שלכם</h2>
  <p>בכל הודעה אפשר לדווח, לחסום את המפרסם או להשתיק. מה שתחסמו לא יוצג לכם עוד. לערעור על הסרה — <a href="/contact/">טופס הפנייה</a>.</p>
</main>
""")

page("terms", "תנאי שימוש — InThePage", "תנאי השימוש של InThePage.", f"""
<main class="wrap">
  <h1>תנאי שימוש</h1>
  <p class="meta">עודכן: {UPDATED}</p>
  {DRAFT}
  <h2>1. השירות</h2>
  <p>InThePage ("השירות") מאפשרת לגולשים לנהל שיחה, לפרסם תגובות ומדיה ולצפות במודעות לצד דפי אינטרנט. השירות מופעל על ידי [שם החברה בע״מ, ח״פ] ("אנחנו"). השירות אינו קשור לאתרים שלצידם הוא מוצג, ואינו משנה את תוכנם.</p>
  <h2>2. חשבון</h2>
  <p>קריאה אינה דורשת חשבון. פרסום דורש התחברות במייל ואישור כללי הקהילה. השימוש מגיל [16] ומעלה. אתם אחראים לפעילות בחשבון שלכם.</p>
  <h2>3. התוכן שלכם</h2>
  <p>התוכן שאתם מפרסמים נשאר שלכם. אתם מעניקים לנו רישיון לא בלעדי להציג אותו בשירות, לשמור אותו לתקופת התוקף שלו ולהעביר אותו לבדיקה אוטומטית. אתם מצהירים שיש לכם זכות לפרסם אותו ושאינו מפר את <a href="/rules/">כללי הקהילה</a> או זכויות של אחרים.</p>
  <h2>4. תוקף התוכן</h2>
  <p>הודעות צ׳אט נשמרות עד 48 שעות; תגובות ומדיה — 7 ימים, או עד תום תקופת ההצמדה שנרכשה. תוכן הצמוד לדף שירד מהאתר נמחק. אנו רשאים להסיר תוכן המפר את התנאים או הדין.</p>
  <h2>5. רכישות</h2>
  <p>חבילות העלאה, הצמדה והבלטה הן רכישה חד-פעמית, ללא חידוש אוטומטי. המחירים כוללים מע״מ. הצמדה נמכרת "כל עוד הדף קיים": אם הדף יורד ונותרו יותר מ-7 ימים לתקופה — יינתן החזר יחסי לאמצעי התשלום. תמונה שלא אושרה בבדיקה — יתרת ההעלאה חוזרת. רכישה בתוך אפליקציה כפופה גם לתנאי חנות האפליקציות.</p>
  <h2>6. פרסומות</h2>
  <p>מודעות מסומנות "ממומן". איננו מציגים מודעות המשתמשות במותג של האתר המוצג, ואיננו מציגים מודעות בשיחה החיה. בעל אתר יכול לבקש שלא יוצגו מודעות או תגובות לצד האתר שלו — <a href="/publishers/">פרטים כאן</a>.</p>
  <h2>7. הסרת תוכן ופניות</h2>
  <p>לבקשת הסרה, דיווח על הפרת זכויות או ערעור — <a href="/contact/">טופס הפנייה</a>. נטפל בפניות בהקדם, ובדרך כלל תוך 24–48 שעות.</p>
  <h2>8. אחריות</h2>
  <p>השירות ניתן כמות שהוא (AS IS). תוכן גולשים משקף את דעת כותביו בלבד. ככל שהדין מתיר, אחריותנו מוגבלת לסכום ששילמתם לנו ב-12 החודשים שקדמו לאירוע.</p>
  <h2>9. דין וסמכות</h2>
  <p>על התנאים יחול הדין הישראלי, וסמכות השיפוט הייחודית נתונה לבתי המשפט המוסמכים בתל אביב-יפו.</p>
  <h2>10. שינויים</h2>
  <p>נעדכן את התנאים מעת לעת ונודיע על שינוי מהותי בשירות. המשך השימוש אחרי השינוי מהווה הסכמה.</p>
</main>
""")

page("privacy", "מדיניות פרטיות — InThePage", "מדיניות הפרטיות של InThePage.", f"""
<main class="wrap">
  <h1>מדיניות פרטיות</h1>
  <p class="meta">עודכן: {UPDATED}</p>
  {DRAFT}
  <p class="lead">בקצרה: איננו שומרים היסטוריית גלישה. אנחנו יודעים על דף רק כשמישהו מפרסם בו, ושומרים כל דבר רק לזמן שהוא נחוץ.</p>
  <h2>מה אנחנו אוספים</h2>
  <ul>
    <li><strong>כתובת הדף שאתם קוראים</strong> — נשלחת לשרת כדי להציג את החדר שלו. כתובת מזוהה רק כגיבוב חד-כיווני עם מפתח סודי, ונשמרת בגלוי רק לדפים שיש בהם תוכן. איננו שומרים איזה משתמש ביקר באיזה דף.</li>
    <li><strong>טקסט הדף</strong> — רק כשאתם לוחצים על כרטיס הפתיחה (סיכום ושאלות לדיון): הטקסט הגלוי של הדף נקרא במכשיר שלכם ונשלח פעם אחת ליצירת הסיכום. נשמר רק הסיכום, לא הטקסט. בדפים עם שדה סיסמה הטקסט לעולם אינו נקרא.</li>
    <li><strong>נוכחות</strong> — מונה "כאן עכשיו" נשמר בזיכרון בלבד ונעלם כשאתם עוזבים.</li>
    <li><strong>חשבון</strong> — גיבוב של כתובת המייל (לא המייל עצמו), שם תצוגה, תאריך הצטרפות ואישור הכללים.</li>
    <li><strong>תוכן שפרסמתם</strong> — לתקופת התוקף שלו: צ׳אט עד 48 שעות, תגובות ומדיה 7 ימים או עד תום ההצמדה.</li>
    <li><strong>רכישות</strong> — יומן רכישות לצורכי חשבונאות ומס. פרטי אשראי אינם נשמרים אצלנו.</li>
    <li><strong>נתונים טכניים</strong> — כתובת IP ויומני שגיאות, עד 30 יום, לאבטחה ולמניעת שימוש לרעה.</li>
  </ul>
  <h2>היכן InThePage כבויה</h2>
  <p>בדפים עם שדה סיסמה, דפי התחברות ותשלום, כתובות עם פרטי גישה, רשתות פנימיות, אתרי בנקים, בריאות ושירותי ממשל — הפאנל כבוי ושום כתובת לא נשלחת לבדיקת תוכן.</p>
  <h2>עם מי אנחנו משתפים</h2>
  <p>ספקי תשתית שפועלים בשמנו בלבד: Cloudflare (אחסון ושרתים), OpenAI (בדיקה אוטומטית של תוכן לפני פרסום), Anthropic (סיכום הדף בכרטיס הפתיחה, כשאתם מבקשים אותו), Resend (שליחת קוד כניסה במייל) וספקי התשלום. חלקם פועלים מחוץ לישראל. איננו מוכרים מידע אישי.</p>
  <h2>הזכויות שלכם</h2>
  <p>אפשר לעיין במידע, לתקן אותו ולמחוק את החשבון וכל התוכן שלכם — ישירות ב"המדיה שלי" ← בטיחות ← מחיקת החשבון. המחיקה מסירה את התוכן מכל הדפים; גיבויים נמחקים בתוך 30 יום. לפניות פרטיות: <a href="/contact/">טופס הפנייה</a>. הממונה על הגנת הפרטיות: [שם ופרטי קשר].</p>
  <h2>ילדים</h2>
  <p>השירות אינו מיועד לילדים מתחת לגיל [16].</p>
</main>
""")

page("accessibility", "הצהרת נגישות — InThePage", "הצהרת הנגישות של InThePage.", f"""
<main class="wrap">
  <h1>הצהרת נגישות</h1>
  <p class="meta">עודכן: {UPDATED}</p>
  {DRAFT}
  <p>אנו פועלים להנגשת InThePage לפי תקן ישראלי 5568 והנחיות WCAG 2.0 ברמה AA.</p>
  <h2>מה עשינו</h2>
  <ul>
    <li>ניגודיות צבעים של 4.5:1 לפחות לטקסט, בתצוגה בהירה וכהה.</li>
    <li>ניווט מלא במקלדת, עם סימון מיקוד ברור. Enter שולח, Shift+Enter ירידת שורה, Esc סוגר חלונות, "/" מעביר לשדה הכתיבה.</li>
    <li>תוויות לקוראי מסך לכל כפתור, ואזור צ׳אט מסומן כיומן הודעות. בחדרים עמוסים ההקראה האוטומטית כבויה, כדי שלא להציף.</li>
    <li>כיבוד הגדרת "הפחתת תנועה" של מערכת ההפעלה.</li>
    <li>תמיכה בהגדלת טקסט ובכיווניות מעורבת של עברית ואנגלית.</li>
  </ul>
  <h2>פנייה בנושא נגישות</h2>
  <p>נתקלתם בקושי? <a href="/contact/?kind=accessibility">כתבו לנו</a>. רכז הנגישות: [שם ופרטי קשר].</p>
</main>
""")

page("publishers", "לבעלי אתרים — InThePage", "איך בעלי אתרים שולטים במה ש-InThePage מציגה לצד האתר שלהם.", """
<main class="wrap">
  <h1>לבעלי אתרים</h1>
  <p class="lead">InThePage מציגה את האתר שלכם כמו שהוא — בלי שינוי, בלי הסתרת המודעות שלכם ובלי הזרקת קוד לדף. השיחה מתנהלת בחלון נפרד, מסומנת "לא קשור לאתר", ואתם שולטים במה שמוצג לצידכם.</p>
  <h2>כיבוי מהיר בתגית אחת</h2>
  <p>הוסיפו לראש הדף (או לכל דף שתבחרו):</p>
  <pre>&lt;meta name="inthepage" content="nocomments,noads"&gt;</pre>
  <p><code>nocomments</code> — ללא צ׳אט ותגובות. <code>noads</code> — ללא מודעות לצד הדף. אפשר להשתמש באחת מהן או בשתיהן. (גם התגית הישנה <code>name="addmedia"</code> ממשיכה לעבוד.)</p>
  <h2>החדר של האתר שלכם</h2>
  <p>בעל אתר יכול לקבל שליטה בחדר של האתר: הודעה נעוצה בראש החדר של כל דף, תג «בעל האתר» ליד מה שאתם כותבים, הסתרת תגובות בחדרים של האתר, סגירת תגובות או תמונות, ונתונים על השיחה. הקוראים רואים שהחדר בניהולכם, וכללי הקהילה של InThePage חלים מעל הכול.</p>
  <p>מאמתים בעלות בתגית בדף הבית, בקובץ או ברשומת DNS, והצוות מאשר. <a class="btn btn-primary" href="/owner/">קבלת שליטה בחדר</a></p>
  <p>בעלי חדר מקבלים גם תג לאתר שמראה כמה קוראים מדברים עכשיו, וקישור אישי: מי שנרשם דרכם נזקף לזכותם, ובהמשך הם יקבלו חלק מהכנסות החסות בחדרים של האתר שלהם.</p>
  <h2>כיבוי לכל הדומיין</h2>
  <p>שלחו בקשה ב<a href="/contact/?kind=publisher">טופס הפנייה</a> עם שם הדומיין, או קבלו שליטה בחדר וסגרו בו תגובות ותמונות בעצמכם.</p>
  <h2>מה אנחנו מתחייבים</h2>
  <ul>
    <li>לא מציגים מודעות שמשתמשות במותג שלכם, ולא מאפשרים למתחרים לפרסם בדפי המותג שלכם.</li>
    <li>לא מציגים מודעות בתוך השיחה החיה.</li>
    <li>מטפלים בבקשות הסרה של תוכן פוגעני או מפר תוך 24–48 שעות.</li>
  </ul>
</main>
""")

page("contact", "יצירת קשר ובקשת הסרה — InThePage", "פנייה, בקשת הסרת תוכן, פרטיות ובעלי אתרים.", """
<main class="wrap">
  <h1>יצירת קשר ובקשת הסרה</h1>
  <p class="lead">כל פנייה מגיעה ישירות לצוות הניהול ומקבלת מענה. לבקשת הסרה — צרפו את כתובת הדף ותארו את התוכן.</p>
  <form id="f" class="card" style="margin-top:20px">
    <label for="kind">נושא</label>
    <select id="kind" name="kind">
      <option value="takedown">בקשת הסרת תוכן / הפרת זכויות</option>
      <option value="privacy">פרטיות ומחיקת מידע</option>
      <option value="publisher">בעל אתר — כיבוי או שיתוף פעולה</option>
      <option value="accessibility">נגישות</option>
      <option value="other">אחר</option>
    </select>
    <label for="name">שם (לא חובה)</label>
    <input id="name" name="name" maxlength="80">
    <label for="email">מייל לחזרה</label>
    <input id="email" name="email" type="email" dir="ltr" required>
    <label for="url">כתובת הדף הרלוונטי (לא חובה)</label>
    <input id="url" name="url" dir="ltr" placeholder="https://">
    <label for="message">פרטי הפנייה</label>
    <textarea id="message" name="message" required minlength="10"></textarea>
    <div style="margin-top:16px"><button class="btn btn-primary" type="submit">שליחה</button></div>
    <div id="msg"></div>
  </form>
</main>
<script>
  const q = new URLSearchParams(location.search);
  if (q.get("kind")) document.getElementById("kind").value = q.get("kind");
  if (q.get("url")) document.getElementById("url").value = q.get("url");
  document.getElementById("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, out = document.getElementById("msg");
    const body = Object.fromEntries(new FormData(f));
    f.querySelector("button").disabled = true;
    try {
      const r = await fetch("/v1/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || "השליחה נכשלה");
      f.innerHTML = '<div class="ok">הפנייה התקבלה. מספר פנייה: ' + j.id + '</div>';
    } catch (err) {
      out.className = "err"; out.textContent = err.message; f.querySelector("button").disabled = false;
    }
  });
</script>
""")

BOOKMARKLET = ("javascript:(function(){var c=document.querySelector('link[rel=canonical]');"
               "var u='https://addmedia.noaplate.com/panel/?url='+encodeURIComponent(location.href)"
               "+(c?'&canonical='+encodeURIComponent(c.href):'')"
               "+'&title='+encodeURIComponent((document.querySelector('meta[property=\"og:title\"]')||{}).content||document.title);"
               "var w=window.open(u,'_blank');if(!w)location.href=u;})();")

page("mobile", "InThePage בטלפון", "איך משתמשים ב-InThePage ב-iPhone ובאנדרואיד.", """
<main class="wrap">
  <h1>InThePage בטלפון</h1>
  <p class="lead">קוראים כתבה? בלחיצה אחת רואים מי עוד קורא אותה עכשיו, ומדברים איתם. בחרו את הטלפון שלכם.</p>

  <h2>אנדרואיד (Chrome)</h2>
  <div class="card">
    <h3>התקנה חד-פעמית</h3>
    <ol>
      <li>פתחו ב-Chrome את <a href="/panel/">addmedia.noaplate.com/panel</a>.</li>
      <li>לחצו על תפריט ⋮ למעלה ובחרו <strong>"הוספה למסך הבית"</strong> ואז <strong>"התקנה"</strong>.</li>
    </ol>
    <h3>שימוש</h3>
    <ol>
      <li>בכל כתבה לחצו <strong>שיתוף</strong>.</li>
      <li>בחרו <strong>InThePage</strong> — השיחה של אותה כתבה נפתחת.</li>
    </ol>
  </div>

  <h2>iPhone (Safari)</h2>
  <div class="card">
    <h3>התקנה חד-פעמית</h3>
    <ol>
      <li>פתחו ב-Safari את <a href="/panel/">addmedia.noaplate.com/panel</a>.</li>
      <li>לחצו על כפתור השיתוף <span aria-hidden="true">⬆︎</span> ובחרו <strong>"הוספה למסך הבית"</strong>.</li>
    </ol>
    <h3>שימוש</h3>
    <ol>
      <li>בכתבה לחצו <strong>שיתוף</strong> ואז <strong>"העתקה"</strong>.</li>
      <li>פתחו את InThePage ממסך הבית ולחצו <strong>"הדבקת קישור מהלוח"</strong>.</li>
    </ol>
  </div>

  <h2>כפתור בסימניות — הכי מהיר</h2>
  <p>כפתור שנשמר בסימניות ופותח את השיחה של הדף שאתם קוראים, בלי להעתיק כלום. עובד ב-Safari, ב-Chrome ובמחשב.</p>
  <div class="card">
    <h3>1. העתקת הקוד</h3>
    <p><button class="btn btn-primary" id="copyBm" type="button">העתקת קוד הכפתור</button> <span id="copied" class="meta" hidden>הועתק ✓</span></p>
    <h3>2. שמירה כסימנייה</h3>
    <ol>
      <li><strong>iPhone:</strong> בדף הזה לחצו שיתוף ← <strong>"הוספת סימנייה"</strong> ושמרו בשם <strong>InThePage</strong>. אחר כך: סימניות ← <strong>עריכה</strong> ← InThePage ← מחקו את הכתובת והדביקו את הקוד ← <strong>סיום</strong>.</li>
      <li><strong>אנדרואיד:</strong> בדף הזה לחצו ⋮ ← ☆ (שמירה כסימנייה) ← <strong>עריכה</strong>. שנו את השם ל-<strong>InThePage</strong>, ובשדה הכתובת מחקו הכול והדביקו את הקוד.</li>
      <li><strong>מחשב:</strong> גררו את הכפתור הזה לסרגל הסימניות: <a class="btn btn-secondary" id="bmLink" href="#">InThePage</a></li>
    </ol>
    <h3>3. שימוש</h3>
    <ol>
      <li><strong>iPhone:</strong> בכתבה לחצו על סמל הסימניות ובחרו <strong>InThePage</strong>.</li>
      <li><strong>אנדרואיד:</strong> בכתבה הקלידו בשורת הכתובת <strong>InThePage</strong> ובחרו את הסימנייה מההצעות (פתיחה מתפריט הסימניות לא מפעילה את הכפתור).</li>
    </ol>
  </div>
  <p class="meta">הכפתור רק קורא את כתובת הדף ואת כותרתו ופותח את InThePage בלשונית חדשה. הוא לא משנה את הדף ולא שומר דבר.</p>
</main>
<script>
  const BM = %s;
  document.getElementById("bmLink").setAttribute("href", BM);
  document.getElementById("bmLink").addEventListener("click", (e) => { e.preventDefault(); alertless(); });
  function alertless() { document.getElementById("copyBm").focus(); }
  document.getElementById("copyBm").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(BM); }
    catch { const t = document.createElement("textarea"); t.value = BM; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
    document.getElementById("copied").hidden = false;
  });
</script>
""" % json.dumps(BOOKMARKLET))

print("pages ok")
