# 있을 수 없는 무게 — 중력파 체험관

천문 수행평가 발표 "있을 수 없는 무게: 중력파로 들은 질량 간극 블랙홀, GW231123"을
직접 만지고 들으며 이해하는 한 페이지짜리 체험 사이트.

정적 사이트다. 서버도, 빌드 도구도, 외부 라이브러리도 쓰지 않는다.
브라우저에서 `index.html`을 열면 그대로 동작한다.

## 구조

```
index.html   페이지 전체
style.css    디자인 토큰과 레이아웃
main.js      공용 상수와 체험 4개
assets/
  GW150914_chirp.wav    발표 때 만든 실제 관측 데이터 소리
  cover-deepfield.jpg   표지 배경 (NASA/ESA, PIA12110, 퍼블릭 도메인)
```

## 로컬에서 보기

```bash
python3 -m http.server 8080
```

`http://localhost:8080` 으로 열면 된다.
오디오는 브라우저 자동 재생 정책 때문에 버튼을 눌러야 시작한다.

## GitHub Pages 배포

1. 깃허브에 새 공개 저장소를 만든다 (예: `gw-lab`).
2. `index.html`, `style.css`, `main.js`, `assets/` 를 올린다.
3. Settings → Pages → Branch `main`, 폴더 `/ (root)` 로 저장한다.
4. 몇 분 뒤 `https://<아이디>.github.io/gw-lab/` 로 열린다.

## 출처

페이지 맨 아래 출처 섹션에 전부 적어 두었다. 요약하면

- Abbott et al. (2016) PRL 116, 061102
- LVK (2025) GW231123, ApJL 993, L25
- LIGO Scientific Collaboration, GWTC-5.0 과학 요약 (2026)
- 계층적 병합 해석 arXiv:2509.10609
- GW150914 변형률 데이터 — GWOSC (gwosc.org)
- 표지 이미지 — NASA/ESA Hubble Deep Field (PIA12110), 퍼블릭 도메인

만든 사람: 장현재
인공지능 활용: 기획과 코드 작성에 생성형 AI(Claude) 사용
