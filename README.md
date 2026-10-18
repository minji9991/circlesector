# 원과 부채꼴 학습지 — 기존 Mini Math Supabase 재사용 버전

이 버전은 기존 `poly_*` 테이블을 변경하지 않습니다. 신규 테이블 `circle_students`, `circle_progress`, `circle_session_events`, `circle_class_control`만 만듭니다.

## 1. 기존 프로젝트 SQL Editor
`schema.sql` 전체를 붙여넣고 Run. 기존 테이블을 삭제하거나 수정하는 SQL은 없습니다.

## 2. Supabase CLI (기존 프로젝트 연결)
```bash
supabase login
supabase link --project-ref 기존프로젝트ID
```
기존 프로젝트의 secrets를 덮어쓰지 않도록 주의하세요. 이 함수는 `TEACHER_PASSWORD`, `CLASSROOM_TOKEN_SECRET`을 사용합니다. 기존에 같은 이름의 secret이 있다면 **기존 값을 그대로 사용**할 수 있습니다. 값이 없다면 아래 명령으로 새로 설정합니다. 이미 값이 있으면 재설정하지 마세요.
```bash
supabase secrets set TEACHER_PASSWORD='교사전용비밀번호' CLASSROOM_TOKEN_SECRET='충분히길고무작위인문자열'
supabase functions deploy circle-classroom --no-verify-jwt
```
`circle-classroom`은 기존 `classroom` 함수와 다른 이름이므로 기존 함수를 덮어쓰지 않습니다.

## 3. GitHub / Vercel
이 폴더 전체를 **새 GitHub 저장소**에 올리고 새 Vercel 프로젝트를 생성하세요.
- Framework: Vite
- Build: `npm run build`
- Output: `dist`
- 환경변수: `VITE_SUPABASE_URL` (기존 프로젝트 URL), `VITE_SUPABASE_ANON_KEY` (기존 프로젝트 공개용 anon key)
- `service_role` 키를 Vercel에 넣지 마세요.

## 4. 점검
교사 로그인 → 반별 단계 공개 → 학생 로그인 → 활동 저장 → 로그아웃/재접속 후 복원 → 반별 기록 확인.

**주의:** 학번·이름을 아는 다른 사람이 해당 학생으로 로그인할 수 있는 단순 식별 방식입니다. 실제 학급 운영 전에는 학생별 비밀번호 등 추가 인증을 권장합니다. `circle_session_events`는 삭제하지 않지만 화면의 이력 조회는 최근 2000건으로 제한됩니다.
