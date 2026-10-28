# Chrome Web Store: AddMedia

Files in this folder: `addmedia-extension-1.0.0.zip` (upload), `shot1-split.png`, `shot2-side.png` (screenshots, 1280×800),
`promo-440x280.png` (small promo tile), `marquee-1400x560.png` (marquee, optional).

## Store listing

**Name:** AddMedia

**Summary (132 chars max):**
שיחה חיה, תגובות ומדיה על כל דף שאתם קוראים, עם כל מי שקורא אותו עכשיו. במסך מפוצל: הדף למעלה, השיחה למטה.

**Description:**
כל דף באינטרנט הוא חדר.

AddMedia מוסיפה לכל כתבה, סרטון או דף שיחה חיה, תגובות ומדיה, עם כל מי שקורא אותו בדיוק עכשיו. האתר נשאר כמו שהוא; השיחה צמודה אליו.

• שיחה חיה: צ'אט של הרגע עם מי שנמצא בדף עכשיו. למעלה רואים כמה אנשים בחדר.
• תגובות (טוקבק): תגובות שנשארות על הדף, עם לייקים ותשובות, «חדשות» ו«מובילות».
• מדיה: תמונות שמוצמדות לכתבה, לכל מי שפותח אותה.
• כל האתר: דף שקט נפתח על החדר של האתר כולו, שם האנשים.
• מסך מפוצל: לחיצה אחת מסדרת את החלון, הדף למעלה ו-AddMedia למטה. או פאנל צד. קיצור: Alt+Shift+S.
• מי כאן, על הסמל: מספר הקוראים הנוכחיים של הדף מופיע על סמל התוסף.

בטיחות: כל הודעה, תגובה ותמונה עוברות סינון לפני שהן מופיעות (קללות ואיומים בעברית, פרטים אישיים, תמונות לא ראויות), ואפשר לדווח בלחיצה. הפאנל כבוי מעצמו בבנקים, בקופות חולים, באתרי ממשלה ובדפי התחברות ותשלום. בעל אתר יכול לבקש שהפאנל לא יופיע באתר שלו.

טקסט בחינם. העלאת תמונות והצמדה ארוכה בחבילות קטנות, בלי מנוי.

נרשמים במייל, בלי סיסמה. מחיקת החשבון מוחקת הכול.

---

Every web page is a room. AddMedia adds live chat, comments and media to any article, video or page, with everyone reading it right now. The site stays as it is; the conversation sits beside it, in a split window (page on top, chat below) or a side panel. Hebrew-first.

**Category:** Social & Communication
**Language:** Hebrew (עברית)

**Homepage:** https://addmedia.noaplate.com/
**Support:** https://addmedia.noaplate.com/contact/
**Privacy policy:** https://addmedia.noaplate.com/privacy/

## Privacy tab

**Single purpose:** Shows a live chat, comments and media panel about the web page the user is currently reading, shared with other readers of the same page.

**Permission justifications:**
- `sidePanel`: the panel is shown in Chrome's side panel next to the page.
- `tabs`: to know the address and title of the active tab, so the panel shows the room of the page being read, and to arrange the split window.
- `storage`: keeps the user's sign-in token and small preferences (chosen layout, dismissed intro) on the device.
- Host permissions (`http://*/*`, `https://*/*`): the content script reads only the page's canonical address, title, favicon and an opt-out meta tag on any page, so the panel can follow the user to any site. It does not read page content, forms or cookies.
- Remote code: none. All code is in the package; the panel talks to addmedia.noaplate.com by API only.

**Data use (tick):** Personally identifiable information: email address (for sign-in only). User activity: none collected by the extension beyond the pages' addresses sent to the service to open their rooms. Website content: the page's address and title.
Certify: not sold to third parties, not used for unrelated purposes, not used for creditworthiness.

## Distribution

Visibility: Public. Regions: all. Pricing: free (purchases are inside the service, not through the store).
