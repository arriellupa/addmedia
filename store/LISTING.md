# Chrome Web Store: InThePage (formerly AddMedia)

Item ID: `kkeefmpcopkjpljhehakkapnehhbbkpb` · Store page: https://chromewebstore.google.com/detail/kkeefmpcopkjpljhehakkapnehhbbkpb

Files in this folder: `inthepage-extension-1.1.0.zip` (upload as a new package of the same item), `icon-128.png` (store icon).
The screenshots and promo tiles from 1.0 (`shot*.png`, `promo-440x280.png`, `marquee-1400x560.png`) still show the old
name and a real news site; they are replaced after the redesign, on fictional sites only.

## What changed in 1.1

- The name is InThePage, with a new icon.
- The extension is a thin shell: its page frames the panel from https://inthepage.com, so the panel's look and features
  are updated on the server. The frame and the extension exchange only a fixed list of messages, checked by origin.
- Layouts: side panel, split screen, and a full-page tab. The last choice between side panel and split screen is remembered.
- No new permissions.

## Store listing

**Name:** InThePage

**Summary (132 chars max):**
שיחה חיה, תגובות ומדיה על כל דף שאתם קוראים, עם מי שקורא אותו עכשיו. בפאנל צד, במסך מפוצל או בדף מלא.

**Description:**
כל דף באינטרנט הוא חדר.

InThePage מוסיפה לכל כתבה, סרטון או דף שיחה חיה, תגובות ומדיה, עם מי שקורא אותו בדיוק עכשיו. האתר נשאר כמו שהוא; השיחה צמודה אליו.

• שיחה חיה: צ'אט של הרגע עם מי שנמצא בדף עכשיו. למעלה רואים כמה אנשים בחדר.
• תגובות (טוקבק): תגובות שנשארות על הדף, עם לייקים ותשובות.
• מדיה: תמונות שמוצמדות לכתבה, לכל מי שפותח אותה.
• כל האתר: דף שקט נפתח על החדר של האתר כולו, שם האנשים.
• שלוש תצוגות: פאנל צד, מסך מפוצל (הדף למעלה, InThePage למטה; Alt+Shift+S) או דף מלא. הבחירה נשמרת.
• מי כאן, על הסמל: מספר הקוראים הנוכחיים של הדף מופיע על סמל התוסף.
• כרטיס פתיחה: בלחיצה, סיכום קצר של הדף ושאלות לדיון.

בטיחות: כל הודעה, תגובה ותמונה עוברות סינון לפני שהן מופיעות (קללות, השמצות ואיומים, פרטים אישיים, תמונות לא ראויות), ואפשר לדווח בלחיצה. הפאנל כבוי מעצמו בבנקים, בקופות חולים, באתרי ממשלה ובדפי התחברות ותשלום. בעל אתר יכול לבקש שהפאנל לא יופיע באתר שלו.

טקסט בחינם. העלאת תמונות והצמדה ארוכה בחבילות קטנות, בלי מנוי.

נרשמים עם שם, מייל וסיסמה; במכשיר חדש נשלח קוד למייל. מחיקת החשבון מוחקת הכול.

---

Every web page is a room. InThePage adds live chat, comments and media to any article, video or page, with everyone reading it right now. The site stays as it is; the conversation sits beside it, in a side panel, a split window (page on top, chat below) or a full-page tab. Hebrew-first.

**Category:** Social & Communication
**Language:** Hebrew (עברית)

**Homepage:** https://inthepage.com/
**Support:** https://inthepage.com/contact/
**Privacy policy:** https://inthepage.com/privacy/

## Privacy tab

**Single purpose:** Shows a live chat, comments and media panel about the web page the user is currently reading, shared with other readers of the same page.

**Permission justifications:**
- `sidePanel`: the panel is shown in Chrome's side panel next to the page.
- `tabs`: to know the address and title of the active tab, so the panel shows the room of the page being read, to arrange the split window and to open links the user taps.
- `storage`: keeps the chosen layout on the device (and, once, hands a 1.0 sign-in over to the panel).
- Host permissions (`http://*/*`, `https://*/*`): the content script reads the page's canonical address, title, favicon and an opt-out meta tag on any page, so the panel can follow the user to any site. Only when the user taps the opening card does it read the page's visible text, to make a short summary; never on pages with a password field. It does not read forms or cookies.

**Remote code:** No. All code that runs in the extension is in the package. The extension page shows the service's panel (https://inthepage.com/panel/) in an iframe, which runs in its own origin, isolated from the extension's APIs. The frame and the extension exchange a fixed list of messages (page identity, open a link, layout, badge count, page text), checked by origin on both sides; anything else is dropped.

**Data use (tick):** Personally identifiable information: name and email address (sign-in). Website content: the page's address and title, and the page's text when the user asks for the opening card. User activity: none collected beyond the addresses of the pages whose rooms the user opens.
Certify: not sold to third parties, not used for unrelated purposes, not used for creditworthiness.

**Note to reviewer (Package → submit):**
Version 1.1 renames the extension to InThePage and moves the panel's UI into an iframe served from https://inthepage.com, so UI updates no longer need a package. The extension itself still identifies the page, arranges the side panel / split window, shows the reader count on the icon and opens links. No permissions were added. The iframe has no access to extension APIs; its messages to the extension are a fixed, validated list (see shell.js).

## Distribution

Visibility: Public. Regions: all. Pricing: free (purchases are inside the service, not through the store).
