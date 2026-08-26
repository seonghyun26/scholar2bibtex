# Scholar Top Result to BibTeX

현재 버전: **1.0.5**

논문 제목으로 Google Scholar를 검색하고, 최상단 결과의 **Cite(인용) → BibTeX**를 열어 텍스트를 클립보드에 복사하는 Manifest V3 Chromium 확장 프로그램입니다. 과도한 백그라운드 스크래핑 대신 실제 Scholar 탭과 콘텐츠 스크립트를 사용합니다.

팝업 UI는 영어입니다.

## Dia / Chromium에 설치

1. ZIP 파일을 내려받았다면 압축을 풉니다.
2. Dia에서 Chromium 확장 관리 페이지를 엽니다. 주소창에 `chrome://extensions`를 입력하세요. Dia 버전에 따라 Settings의 Extensions 메뉴에서 열 수도 있습니다.
3. 오른쪽 위 **Developer mode(개발자 모드)**를 켭니다.
4. **Load unpacked(압축해제된 확장 프로그램을 로드합니다)**를 누릅니다.
5. 이 README와 `manifest.json`이 들어 있는 `google-scholar-bibtex-extension` 폴더를 선택합니다.
6. 툴바에서 확장 프로그램을 고정하면 편리합니다.

## 사용법

- 확장 아이콘을 누르고 논문 제목을 입력한 다음 **Copy top result BibTeX**를 누릅니다. (입력창에서 Enter를 눌러도 됩니다.)
- 웹페이지에서 논문 제목을 선택하고 오른쪽 클릭한 뒤 **Copy Scholar BibTeX for "…"**를 선택할 수도 있습니다.
- 선택한 텍스트가 있는 상태에서 macOS는 `Command+Shift+B`, Windows/Linux는 `Ctrl+Shift+B`를 누를 수도 있습니다. 선택 텍스트가 없으면 마지막 입력 제목을 재사용하거나 팝업을 엽니다.
- Scholar 탭이 백그라운드로 열리고 작업이 진행됩니다. 완료 여부는 팝업 상태와 확장 아이콘 배지(`...` 진행 중 / `✓` 성공 / `!` 실패)로 확인할 수 있습니다.
- 성공하면 Scholar 탭은 자동으로 닫힙니다. 실패하면 원인을 확인할 수 있도록 탭을 남겨 두고, CAPTCHA인 경우에는 해당 탭으로 전환합니다.

## 권한 설명

- `https://scholar.google.com/*`: Scholar 검색 결과와 Cite 창에 접근합니다.
- `https://scholar.googleusercontent.com/*`: Cite 창의 BibTeX 링크가 반환하는 텍스트를 가져옵니다.
- `tabs`: 검색용 Scholar 탭을 열고 작업이 끝나면 정리합니다.
- `activeTab`, `scripting`: 단축키를 눌렀을 때 현재 탭의 선택 텍스트만 읽어옵니다. 단축키를 누른 그 순간에만 권한이 부여됩니다.
- `storage`: 현재 작업과 팝업 상태를 브라우저 세션 동안 저장합니다(`chrome.storage.session`, 디스크에 남지 않음).
- `contextMenus`: 선택 텍스트용 오른쪽 클릭 메뉴를 추가합니다.
- `clipboardWrite`, `offscreen`: 가져온 BibTeX를 클립보드에 안정적으로 기록합니다.

확장 프로그램은 별도 서버로 논문 제목이나 BibTeX를 전송하지 않습니다.

## 오류와 제한

- Scholar가 CAPTCHA 또는 "unusual traffic" 화면을 표시하면 탭에서 직접 인증한 뒤 다시 시도하세요.
- 검색 결과가 없거나 Cite/BibTeX 요소를 찾지 못하면 팝업에 원인을 표시합니다. Scholar의 DOM이 바뀐 경우 `content.js`의 선택자(`RESULT_SELECTOR`, `CITE_SELECTOR`, `findBibtexLink`)를 업데이트해야 할 수 있습니다.
- 최상단 결과를 그대로 사용합니다. 제목이 짧거나 흔하면 다른 논문이 잡힐 수 있으니 저자나 연도를 함께 입력하면 정확도가 올라갑니다.
- Scholar의 이용 정책과 요청 제한을 지켜 사용하세요. 한 번의 사용자 동작마다 한 건만 처리하며 대량 수집 기능은 포함하지 않습니다.
- 조직 정책이나 브라우저 설정에 따라 기본 단축키가 충돌할 수 있습니다(`Ctrl/Command+Shift+B`는 북마크바 토글과 겹칠 수 있습니다). `chrome://extensions/shortcuts`에서 변경할 수 있으며, 팝업 하단의 **Change shortcut** 링크로 바로 이동합니다.
- 작업 전체 제한 시간은 60초입니다.

## 구조

| 파일 | 역할 |
| --- | --- |
| `background.js` | 서비스 워커. 작업 상태 관리, Scholar 탭 생성, `.bib` 텍스트 fetch, 배지 표시, 컨텍스트 메뉴/단축키 처리 |
| `content.js` | Scholar 페이지에서 최상단 결과 → Cite 클릭 → BibTeX 링크 추출. 숨은 탭에서도 반응하도록 MutationObserver 사용 |
| `offscreen.js` | 클립보드 쓰기 전용 오프스크린 문서 |
| `popup.html/js/css` | 제목 입력과 실시간 상태 표시 (라이트/다크 모드 지원) |

## 개발

파일을 수정한 뒤 `chrome://extensions`에서 이 확장 프로그램의 새로고침 버튼을 누릅니다. 서비스 워커 오류는 확장 상세 화면의 Inspect views에서, 콘텐츠 스크립트 오류는 Scholar 탭의 개발자 도구에서 확인할 수 있습니다.
