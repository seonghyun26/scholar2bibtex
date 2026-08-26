<p align="center">
  <img src="icons/icon128.png" width="96" alt="Scholar2BibTeX icon">
</p>

<h1 align="center">Scholar2BibTeX</h1>

<p align="center">
  드래그 → 단축키 → Google Scholar 최상단 결과의 BibTeX가 클립보드에.<br>
  <em>Drag → shortcut → the top Google Scholar result's BibTeX is on your clipboard.</em>
</p>

<p align="center">
  <img src="preview.png" width="380" alt="Scholar2BibTeX popup preview">
</p>

---

## 사용법 / Usage

### 한국어

1. Overleaf(또는 아무 웹페이지)에서 **검색할 논문 제목을 드래그**합니다.
2. 단축키를 누릅니다 — macOS `⌘⇧B`, Windows·Linux `Ctrl+Shift+B`.
3. Google Scholar **최상단 결과의 BibTeX가 알아서 클립보드에 복사**됩니다. `.bib` 파일에 그대로 붙여넣으면 끝입니다.

진행 상황은 확장 아이콘 배지로 확인할 수 있습니다 — `...` 진행 중, `✓` 성공, `!` 실패.

### English

1. In Overleaf (or any web page), **drag-select the paper title** you want to look up.
2. Press the shortcut — `⌘⇧B` on macOS, `Ctrl+Shift+B` on Windows/Linux.
3. The BibTeX of the **top Google Scholar result is copied to your clipboard** automatically. Paste it straight into your `.bib` file.

The toolbar badge shows progress — `...` working, `✓` copied, `!` failed.

<details>
<summary><b>다른 방법 / Other ways</b></summary>

- **팝업 / Popup** — 확장 아이콘을 누르고 제목을 입력한 뒤 Enter. / Click the icon, type a title, hit Enter.
- **우클릭 / Right-click** — 선택한 제목에서 우클릭 → *Copy Scholar BibTeX for "…"*. / Right-click the selection → *Copy Scholar BibTeX for "…"*.

</details>

---

## 설치 / Installation

Chromium 기반 브라우저(Chrome, Edge, Brave, Arc, Dia, Whale 등)에서 동작합니다.<br>
Works on any Chromium-based browser (Chrome, Edge, Brave, Arc, Dia, Whale, …). Chrome 116+ 필요 / Chrome 116+ required.

### 한국어

1. 이 저장소를 클론하거나 ZIP으로 내려받아 압축을 풉니다.
2. 주소창에 `chrome://extensions` 를 입력해 확장 프로그램 관리 페이지를 엽니다.
3. 오른쪽 위 **개발자 모드(Developer mode)** 를 켭니다.
4. **압축해제된 확장 프로그램을 로드합니다(Load unpacked)** 를 누릅니다.
5. `manifest.json` 이 들어 있는 이 폴더를 선택합니다.
6. 툴바에 확장 프로그램을 고정하면 편리합니다.

### English

1. Clone this repository, or download the ZIP and unzip it.
2. Open `chrome://extensions` in the address bar.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select this folder — the one containing `manifest.json`.
6. Pin the extension to your toolbar.

---

## 문제 해결 / Troubleshooting

| 증상 / Symptom | 해결 / Fix |
| --- | --- |
| 단축키가 안 먹힘 / Shortcut does nothing | `⌘⇧B`는 북마크바 토글과 겹칠 수 있습니다. `chrome://extensions/shortcuts` 에서 변경하세요 (팝업의 *Change shortcut* 링크). / It can clash with the bookmarks bar toggle — rebind it at `chrome://extensions/shortcuts`. |
| CAPTCHA 화면 / CAPTCHA screen | 열린 Scholar 탭에서 직접 인증한 뒤 다시 시도하세요. / Solve it in the Scholar tab that opens, then retry. |
| 다른 논문이 복사됨 / Wrong paper copied | 최상단 결과를 그대로 씁니다. 저자나 연도를 함께 드래그하면 정확해집니다. / It always takes the top hit — include the author or year in your selection. |

논문 제목이나 BibTeX를 외부 서버로 전송하지 않습니다.<br>
Nothing is ever sent to a third-party server.
