# Building an individual APK

The workflow **Build APK for a user project** builds a separate debug APK from one HTML project without placing a GitHub token in the public website.

## Add a project
1. Export the project's HTML from A.S. APP BUILDER.
2. Create a folder named `projects/<slug>/`, using only lowercase letters, digits, and hyphens (1–40 characters; start with a letter or digit).
3. Upload the exported HTML as `projects/<slug>/index.html` and commit it to `main`.
4. Open **Actions → Build APK for a user project → Run workflow**.
5. Enter the exact folder slug and start the build.
6. When the run succeeds, download the artifact named `project-<slug>-apk`. It contains `app-debug.apk`.

Each build changes the Android package ID to `tj.as.generated.<slug>` (hyphens are converted to underscores) so the APK has its own install identity. The displayed app label is the slug.

## Important security and limitations
- This is a manual, repository-owner-triggered workflow, not a public website API. The static site cannot safely start builds for visitors because it has no authenticated server and must not contain a GitHub token.
- Project HTML is executable code. Review it before committing/building; the simple secret-pattern check is not a complete security scanner.
- APKs are unsigned debug builds intended for testing and sideloading. Android asks the user to approve installation.
- This WebView wrapper currently packages HTML assets only. Native Android APIs, arbitrary dependencies, and full native game engines are not generated automatically.
- Builds are isolated to a workflow runner and produce an artifact; they do not overwrite the builder APK release.
