# 기존 업무용 Supabase에 연결하기

새 프로젝트를 만들지 않습니다. 현재 사용 중인 업무용 프로젝트 안에
`teacher_hub`이라는 전용 데이터 공간과 `teacher-work-hub`이라는 전용 파일
공간을 추가합니다.

> 실행 전 확인: 현재 프로젝트가 업무용 프로젝트가 맞는지 화면 위쪽의 프로젝트
> 이름을 먼저 확인해 주세요. `supabase/schema.sql`에는 기존 `public` 테이블을
> 삭제하거나 수정하는 명령이 없습니다.

## 1. 데이터베이스 구조 만들기

1. Supabase 왼쪽 메뉴에서 `>_` 모양의 **SQL Editor**를 누릅니다.
2. **New query**를 누릅니다.
3. 이 저장소의 `supabase/schema.sql` 내용을 전부 복사해 붙여넣습니다.
4. 오른쪽 아래 또는 위쪽의 **Run**을 누릅니다.
5. 성공 표시가 나오면 왼쪽의 **Table Editor**로 돌아옵니다.
6. Table Editor 위쪽의 `schema public` 선택 상자를 누릅니다.
7. 목록에서 `teacher_hub`을 선택합니다.
8. `categories`, `documents`, `document_categories`, `app_admins`가 보이는지 확인합니다.

SQL은 한 번만 실행하면 됩니다. 오류가 나타나면 같은 SQL을 반복해서 실행하지
말고 오류 문구를 그대로 알려 주세요.

## 2. 앱에서 teacher_hub을 사용할 수 있게 열기

1. 왼쪽 아래 **톱니바퀴(Project Settings)**를 누릅니다.
2. **API** 또는 **Data API** 메뉴를 엽니다.
3. **Exposed schemas** 항목을 찾습니다.
4. 기존 값은 지우지 말고 `teacher_hub`을 추가합니다.
5. **Save**를 누릅니다.

이 설정은 `teacher_hub` 안의 테이블을 웹 앱에서 사용할 수 있게 해줍니다.
누가 무엇을 할 수 있는지는 SQL에 포함된 별도의 보안 정책이 제한합니다.

## 3. 파일 버킷 만들기

1. 왼쪽 메뉴에서 **폴더 모양 Storage**를 누릅니다.
2. **New bucket**을 누릅니다.
3. 이름에 정확히 `teacher-work-hub`을 입력합니다.
4. **Public bucket**을 켭니다.
5. 파일 크기 제한을 설정할 수 있으면 **50 MB**로 지정합니다.
6. **Create bucket**을 누릅니다.

허용할 파일은 PDF, HWP/HWPX, DOC/DOCX, XLS/XLSX, PPT/PPTX,
JPG/JPEG/PNG입니다. 실제 업로드 화면과 데이터베이스에서도 50MB 제한을 다시
검사합니다.

공개 버킷은 파일 조회와 다운로드가 공개된다는 뜻입니다. 수정과 삭제는
로그인한 관리자에게만 허용됩니다.

## 4. 관리자 계정 준비하기

1. 왼쪽 메뉴에서 **자물쇠 모양 Authentication**을 누릅니다.
2. **Users**를 엽니다.
3. 사용할 본인 계정이 이미 있다면 그 계정을 그대로 사용합니다.
4. 계정이 없다면 **Add user**에서 이메일과 비밀번호로 계정 하나를 만듭니다.
5. 해당 사용자의 **User ID(UUID)**를 복사합니다. 이메일 주소가 아니라 긴 영문·숫자 ID입니다.
6. 다시 **SQL Editor → New query**로 이동합니다.
7. 아래 문장에서 `여기에-USER-ID` 부분을 복사한 ID로 바꿉니다.

```sql
insert into teacher_hub.app_admins (user_id)
values ('여기에-USER-ID');
```

8. **Run**을 누릅니다.

앱에는 공개 회원가입 화면을 만들지 않습니다. 여기에 등록한 계정만 자료
수정·삭제와 카테고리 관리를 할 수 있습니다.

## 5. 프로젝트 주소와 공개 키 확인하기

1. 왼쪽 아래 **톱니바퀴(Project Settings)**를 누릅니다.
2. **API Keys** 또는 **Data API**를 엽니다.
3. 다음 두 값을 확인합니다.
   - Project URL
   - Publishable key 또는 anon public key
4. 비밀번호나 `service_role` 키는 복사하지 않습니다.

로컬 앱의 `.env.local`에는 다음과 같이 넣습니다.

```text
NEXT_PUBLIC_SUPABASE_URL=Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=Publishable key 또는 anon public key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## 6. Vercel에 등록하기

Vercel 프로젝트의 **Settings → Environment Variables**에서 다음 값을
등록합니다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` — 실제 Vercel 공개 주소

환경변수를 추가한 뒤에는 다시 배포해야 반영됩니다.

## 권한 요약

| 기능 | 로그인하지 않은 방문자 | 관리자 |
|---|---:|---:|
| 자료 조회·검색·다운로드 | 가능 | 가능 |
| 새 자료 업로드 | 가능 | 가능 |
| 기존 자료 수정·파일 교체 | 불가능 | 가능 |
| 휴지통 이동·복원·영구삭제 | 불가능 | 가능 |
| 카테고리 관리 | 불가능 | 가능 |

브라우저에는 공개용 키만 사용합니다. `service_role` 키, 데이터베이스 비밀번호,
연결 문자열은 코드나 Vercel의 공개 환경변수에 넣지 않습니다.
