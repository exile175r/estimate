# 견적 작업실

SPEC.md에 따른 HTML / CSS / JavaScript 웹앱입니다. 앱 실행에는 프레임워크·DB·외부 패키지를 사용하지 않습니다. 브라우저/PDF 검증 도구는 개발 의존성으로만 사용합니다.

## 실행

```sh
npm start
```

브라우저에서 `http://localhost:8000`을 엽니다. ES 모듈을 사용하므로 HTML을 직접 파일로 열지 않습니다. Codespaces에서는 Ports 탭에서 8000 포트를 엽니다.

```sh
npm test
```

Node.js 22.13 이상(검증 환경: 24.21.0)에서 실행합니다. Python은 필요하지 않습니다.

화면·PDF 테스트:

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:ui
```

한글 PDF 시각 검증에는 OS에 한글 글꼴(예: Noto Sans KR)이 있어야 합니다. 이 Codespaces에서 준비한 임시 브라우저·글꼴을 이용하려면 다음 명령을 사용합니다. 임시 경로는 환경 재생성 시 사라질 수 있습니다.

```sh
FONTCONFIG_FILE=/tmp/estimate-fonts.conf PLAYWRIGHT_BROWSERS_PATH=/tmp/estimate-browsers npm run test:ui
```

실제 검증 결과와 수용 기준 대조표는 [QA.md](QA.md)에, 화면 캡처와 PDF는 [artifacts/qa](artifacts/qa)에 있습니다. 테스트 데이터는 테스트 브라우저 메모리에서만 만들며 실제 Drive에 저장하지 않습니다.

## 사용

1. 단가표 관리에서 루트 그룹, 하위 그룹, 항목을 만듭니다.
2. 대상을 선택해 이름·단가·단위·설명을 편집합니다. 트리 이름 변경은 Enter 또는 포커스 이동으로 반영하고 Escape로 취소합니다.
3. 트리 행에 드롭하면 대상 앞에 정렬됩니다. 폴더의 ‘안으로’에 드롭하면 그 폴더로 이동합니다. 하단 루트 영역에는 그룹만 이동할 수 있습니다.
4. 견적 작성 화면에서 항목을 선택하고 미리보기 안에서 내용을 수정합니다. 중복 선택은 매번 추가 방식을 묻습니다.
5. 인쇄 / PDF 미리보기에서 브라우저의 PDF 저장을 사용할 수 있습니다. 이는 잠정 출력 방식이며 Drive 저장이 아닙니다.

**현재 데이터는 메모리에만 존재합니다. 새로고침·탭 닫기 시 사라집니다.** 사용자 요청에 따라 Google 인증은 보류했습니다. 저장·임시 저장·목록 조회는 연결 필요 안내만 제공하며 성공을 표시하지 않습니다. 로컬 저장이나 샘플을 Drive 데이터로 취급하지 않습니다.

## 파일 구조

- `index.html`: 작성·관리자·저장 목록 화면과 중복 선택 대화상자
- `styles.css`: 반응형 화면과 임시 인쇄 스타일
- `src/model.js`: 트리·이동·복제·견적 스냅샷
- `src/calculation.js`: 임시 계산 정책 (단가 × 수량의 합)
- `src/storage.js`: 폴더 입력 검증 및 미연결 저장 경계
- `src/app.js`: 화면 이벤트와 렌더링
- `tests/model.test.js`: 핵심 규칙 및 실패 처리 검증
- `tests/browser/`: 실제 Chromium 조작·반응형·PDF 검증
- `scripts/serve.js`: Node.js 개발용 정적 서버
- `playwright.config.js`: 브라우저 검증 설정
- `QA.md`: 검증 결과와 한계
- `TODO.md`: 구현 범위와 미결정 사항

계산은 명세에서 허용한 명시적 임시 가정입니다. VAT·할인·절삭·반올림 등은 적용하지 않았습니다. 최종 계산 정책이나 PDF 서식을 확정한 구현이 아닙니다.
