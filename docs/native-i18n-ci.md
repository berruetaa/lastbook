# Native i18n checks

The pull-request checks run the portability preflight and the native source-shell
smoke on Windows 2025 and macOS 15 ARM64. The smoke starts `app/main.py` in
separate processes, uses the project's WebView2 or WKWebView shell and bridge,
and serves the staged shipping web assets. Test-only host APIs drive the page;
no debug port or security restriction is enabled or removed. It checks the
English default, saving Spanish in Setup, persistence after restart, Settings,
and return to English in the library. The error observer starts after the page
loads, so it does not cover JavaScript errors before instrumentation.

The workflow can also be dispatched manually. Full builds are opt-in because
they compile the pinned LLM runner and use more runner time:

```sh
gh workflow run native-i18n-desktop.yml --ref BRANCH -f platform=windows -f build_windows_llm=true
gh workflow run native-i18n-desktop.yml --ref BRANCH -f platform=macos -f build_macos=true
```

The official build scripts run their existing SHA-256 checks, TLS gate and
package scans; a failed gate fails the job. The Windows app folder is unsigned
and the macOS bundle is ad-hoc signed. The Windows installer, release signing
and notarization are not performed. Artifacts are retained for seven days.

To inspect a previously built artifact with native Accessibility or UI
Automation, supply the successful build's run ID. The runner verifies the
artifact digest, launches the packaged application with a synthetic library and
isolated settings, uses native controls to save Spanish in Settings, and opens
a new process to check it persisted. A missing accessibility session is a
failure rather than a passing test. Screenshots, accessibility trees, app logs,
and reports are retained as artifacts.

```sh
gh workflow run native-i18n-desktop.yml --ref BRANCH -f packaged_windows_run_id=BUILD_RUN_ID
gh workflow run native-i18n-desktop.yml --ref BRANCH -f packaged_macos_run_id=BUILD_RUN_ID
```

The packaged checks do not cover first-run Setup, installer installation,
native menus, release signatures, a real data pack, or model downloads. They
also do not establish absence of every possible JavaScript error. Fork pull
requests may require the repository's normal Actions approval. The workflow
uses `pull_request`, read-only permissions and no secrets; it does not use
`pull_request_target`.
