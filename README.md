# Sahitya (ಸಾಹಿತ್ಯ): free Indian literature reader

Read classic books and poetry in Kannada, Hindi, English, Tamil, Telugu, Malayalam, Bengali, Marathi, Gujarati, Punjabi, Sanskrit, Odia, Assamese, Urdu and Nepali. Free, no account, no ads.

**Book sources (all free):** Wikisource, Project Gutenberg, Internet Archive.

**Features:** search by book, poem or writer; browse per language; reader with text size and light/sepia/dark themes; remembers your place; save books and read saved texts offline.

---

## Get the APK (free, about 10 minutes, no software to install)

1. Create a free account at <https://github.com> and make a **new repository** (any name, Public or Private).
2. Upload everything in this folder to it (**Add file → Upload files**; drag the whole folder contents, including the hidden `.github` folder). Commit to the `main` branch.
3. Open the repository's **Actions** tab. If asked, click to enable workflows.
4. Choose **Build APK** on the left, then **Run workflow**. Wait 5 to 10 minutes for the green tick.
5. On the repository's main page, open **Releases** (right-hand side, or add `/releases` to the repository address). The newest release has a direct **Sahitya.apk** download link.
6. Open that page on your phone, tap **Sahitya.apk**, then open the downloaded file and allow **Install unknown apps** when Android asks.

(A copy is also kept under the finished run's **Artifacts** as a zip.)

If the Releases step fails with a permissions error, go to **Settings → Actions → General → Workflow permissions**, choose **Read and write permissions**, save, and run the workflow again.

If the build shows a red cross, open the failed step and send me the error text; I'll fix it.

## Alternative: build on your own computer

Needs Node.js 22+, JDK 21 and Android Studio.

```
npm install
npx cap add android
npx @capacitor/assets generate --android
npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK appears at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Try it in a browser first

Run `npx serve www` (or open `www/index.html` through any local web server). Most books load in a browser; some Gutenberg texts need the Android app because their site blocks browser requests.

## Notes

- The debug APK installs directly on any Android phone. To publish on Google Play you will need a signed release build and a developer account.
- Newer books are mostly still under copyright, so the catalogue is strongest for classics, devotional poetry and older authors.
- To add or change search shortcuts, edit the `SUGGEST` list in `www/app.js`.
